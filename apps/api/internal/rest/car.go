package rest

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
	"github.com/rs/zerolog/log"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/ports"
)

// validate is shared: the package caches struct reflection per type, so one
// instance for the process is both the documented usage and the fast one.
var validate = newValidator()

func newValidator() *validator.Validate {
	v := validator.New(validator.WithRequiredStructEnabled())

	// Report the json name in errors, so a client sees the field it sent
	// ("usageType") rather than the Go one ("UsageType").
	v.RegisterTagNameFunc(func(field reflect.StructField) string {
		name := strings.Split(field.Tag.Get("json"), ",")[0]
		if name == "-" {
			return ""
		}
		return name
	})

	return v
}

// invalidParams turns validator's errors into the invalid-params entries of a
// problem response, one per field, named as the client sent it.
func invalidParams(errs validator.ValidationErrors) []InvalidParam {
	params := make([]InvalidParam, 0, len(errs))
	for _, e := range errs {
		params = append(params, InvalidParam{Name: e.Field(), Reason: reason(e)})
	}

	return params
}

// reason states, in the client's terms, what the failed rule wanted.
func reason(e validator.FieldError) string {
	switch e.Tag() {
	case "required":
		return "This field is required"
	case "min":
		return fmt.Sprintf("This field must be at least %s", bound(e))
	case "max":
		return fmt.Sprintf("This field must be at most %s", bound(e))
	case "len":
		return fmt.Sprintf("This field must be exactly %s", bound(e))
	case "gt":
		return fmt.Sprintf("This field must be greater than %s", bound(e))
	case "gte":
		return fmt.Sprintf("This field must be %s or more", bound(e))
	case "lt":
		return fmt.Sprintf("This field must be less than %s", bound(e))
	case "lte":
		return fmt.Sprintf("This field must be %s or less", bound(e))
	case "oneof":
		// oneof's parameter is space separated: "daily track show".
		return fmt.Sprintf("This field must be one of: %s", strings.Join(strings.Fields(e.Param()), ", "))
	default:
		return fmt.Sprintf("Failed the %q rule", e.Tag())
	}
}

// bound renders a comparison tag's parameter with the unit that tag counts for
// the field's kind: characters for strings, items for collections, and the
// bare value for numbers, which compare by value rather than by length.
func bound(e validator.FieldError) string {
	switch e.Kind() {
	case reflect.String:
		return fmt.Sprintf("%s characters", e.Param())
	case reflect.Slice, reflect.Array, reflect.Map:
		return fmt.Sprintf("%s items", e.Param())
	default:
		return e.Param()
	}
}

// carRuleProblems name the field behind each database-level rejection that
// identifies one. The database enforces the same rules as the validate tags,
// so these are reported in the same shape a validation failure is — a client
// handles one code path whichever layer caught the problem.
var carRuleProblems = map[error]InvalidParam{
	domain.ErrInvalidUsageType: {Name: "usageType", Reason: "This field must be one of: daily, track, show, weekend, off-road, project"},
	domain.ErrInvalidYear:      {Name: "year", Reason: "This field must be between 1885 and 2030"},
}

// carWriteProblem renders a failed create as the response the caller should
// see, reporting whether the error was one it knows. Anything else is the
// server's problem, not the caller's, and is left to serverProblem.
func carWriteProblem(err error) (Problem, bool) {
	for rule, param := range carRuleProblems {
		if errors.Is(err, rule) {
			return Problem{
				Type:          typeValidationFailed,
				Title:         "The car details did not validate",
				Status:        http.StatusUnprocessableEntity,
				InvalidParams: []InvalidParam{param},
			}, true
		}
	}

	switch {
	// Neither code names the column it rejected by the time it reaches here,
	// so the caller is told the rule without a field to hang it on.
	case errors.Is(err, domain.ErrMissingField):
		return Problem{
			Type:   typeValidationFailed,
			Title:  "The car details did not validate",
			Status: http.StatusUnprocessableEntity,
			Detail: "A required field was empty.",
		}, true
	case errors.Is(err, domain.ErrFieldTooLong):
		return Problem{
			Type:   typeValidationFailed,
			Title:  "The car details did not validate",
			Status: http.StatusUnprocessableEntity,
			Detail: "A field was longer than the maximum allowed.",
		}, true

	// The owner comes from the token, never from the body, so an owner the
	// database does not have means the account is gone — the caller cannot fix
	// that by editing the car, only by signing in again.
	case errors.Is(err, domain.ErrUnknownOwner):
		return Problem{
			Status: http.StatusUnauthorized,
			Detail: "This account no longer exists. Please sign in again.",
		}, true
	}

	return Problem{}, false
}

type CarHandler struct {
	carService ports.CarService
}

func NewCarHandler(carService ports.CarService) *CarHandler {
	return &CarHandler{
		carService: carService,
	}
}

func (h *CarHandler) CreateCar(w http.ResponseWriter, r *http.Request) {
	var request domain.Car

	body := http.MaxBytesReader(w, r.Body, 1048576) // Limit request body to 1MB

	decodeErr := json.NewDecoder(body).Decode(&request)

	if decodeErr != nil {
		writeProblem(w, r, Problem{
			Type:   typeMalformedBody,
			Title:  "The request body could not be read",
			Status: http.StatusBadRequest,
			Detail: "The body must be a JSON object describing the car.",
		})
		return
	}

	if err := validate.Struct(request); err != nil {
		var validateErrs validator.ValidationErrors
		if !errors.As(err, &validateErrs) {
			// Not the caller's fault: a bad tag or an unsupported type.
			log.Error().Err(err).Msg("Failed to validate car payload")
			serverProblem(w, r)
			return
		}

		writeProblem(w, r, Problem{
			Type:          typeValidationFailed,
			Title:         "The car details did not validate",
			Status:        http.StatusUnprocessableEntity,
			InvalidParams: invalidParams(validateErrs),
		})
		return
	}

	request.UserId = domain.MustUserID(r.Context())

	car, err := h.carService.CreateCar(r.Context(), request)

	if err != nil {
		if problem, known := carWriteProblem(err); known {
			// The validate tags above should have caught every one of these, so
			// reaching here means a rule is enforced in only one of the two
			// places. Logged as a warning: the caller is answered correctly, but
			// the mismatch is ours to fix.
			log.Warn().Err(err).Msg("Car rejected by the database after passing validation")
			writeProblem(w, r, problem)
			return
		}

		log.Error().Err(err).Msg("Failed to create car")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusCreated, car)
}
