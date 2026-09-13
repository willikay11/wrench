package rest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-playground/validator/v10"
	"github.com/google/uuid"
	"github.com/rs/zerolog"
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

	// validator cannot see inside Nullable, so it is unwrapped to the value the
	// tags are written against. A field sent as null unwraps to the zero value,
	// which omitempty then skips — clearing a field is not a length violation.
	v.RegisterCustomTypeFunc(func(field reflect.Value) any {
		notes, ok := field.Interface().(domain.Nullable[string])
		if !ok || notes.Value == nil {
			return ""
		}
		return *notes.Value
	}, domain.Nullable[string]{})

	// notblank refuses a present-but-empty string. PATCH needs it because its
	// fields are pointers: omitempty skips only a field the body left out, so
	// without this a make sent as "" (or as whitespace, once trimmed) would be
	// written. Registering a tag can only fail on a malformed name, which is a
	// programming error, hence the panic.
	if err := v.RegisterValidation("notblank", func(fl validator.FieldLevel) bool {
		return strings.TrimSpace(fl.Field().String()) != ""
	}); err != nil {
		panic(err)
	}

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
	case "notblank":
		return "This field cannot be blank"
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

	// A car that does not exist and a car belonging to someone else are the
	// same answer on purpose: a 403 here would confirm that the id is real and
	// let a caller enumerate other users' cars (standards.ownership).
	case errors.Is(err, domain.ErrCarNotFound):
		return Problem{
			Status: http.StatusNotFound,
			Detail: "No car with that id.",
		}, true

	// Nothing was asked for, so nothing happened — a 200 would report a change
	// that was never made.
	case errors.Is(err, domain.ErrNoFieldsToUpdate):
		return Problem{
			Type:   typeValidationFailed,
			Title:  "The car details did not validate",
			Status: http.StatusUnprocessableEntity,
			Detail: "Provide at least one field to update.",
		}, true

	// The owner comes from the token, never from the body, so an owner the
	// database does not have means the account is gone — the caller cannot fix
	// that by editing the car, only by signing in again.
	case errors.Is(err, domain.ErrUnknownOwner):
		return Problem{
			Status: http.StatusUnauthorized,
			Detail: "This account no longer exists. Please sign in again.",
		}, true

	case errors.Is(err, domain.ErrCarNotFound):
		return Problem{
			Status: http.StatusNotFound,
			Detail: "This car does not exist",
		}, true

	}

	return Problem{}, false
}

// withUser adds the authenticated user to a log event, so a failure can be
// traced to the request that caused it. The UUID and never the email, which is
// PII and must stay out of the logs entirely.
//
// UserIDFrom rather than MustUserID: emitting a log line must not panic, and
// the earliest failures here are logged before the id has been read off the
// context. When there is none the field is simply absent.
func withUser(event *zerolog.Event, ctx context.Context) *zerolog.Event {
	if userID, ok := domain.UserIDFrom(ctx); ok {
		return event.Str("userId", userID.String())
	}
	return event
}

// malformedBody is the response for a body the endpoint could not take as a
// whole: unreadable, carrying a field it does not define, or holding more than
// the single object it expects. Detail says which, while the type and title
// stay the same for all of them — the client's fix is the same in every case.
func malformedBody(detail string) Problem {
	return Problem{
		Type:   typeMalformedBody,
		Title:  "The request body could not be read",
		Status: http.StatusBadRequest,
		Detail: detail,
	}
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

	decoder := json.NewDecoder(body)

	// A field this endpoint does not define is a client mistake — a typo, or a
	// field meant for a different endpoint. Dropping it silently answers 201 to
	// a request that did not say what the client thought it said.
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&request); err != nil {
		writeProblem(w, r, malformedBody("The body must be a JSON object describing the car, using only the fields this endpoint defines."))
		return
	}

	// Decode stops at the end of the first JSON value and ignores the rest, so
	// a body carrying two objects, or one object and a tail of junk, would
	// otherwise be accepted on the strength of the part that happened to parse.
	if decoder.More() {
		writeProblem(w, r, malformedBody("The body must contain exactly one JSON object."))
		return
	}

	// Whitespace is trimmed before the rules run, so blank values fail them and
	// padded ones are stored without the padding.
	request.Normalize()

	if err := validate.Struct(request); err != nil {
		var validateErrs validator.ValidationErrors
		if !errors.As(err, &validateErrs) {
			// Not the caller's fault: a bad tag or an unsupported type.
			withUser(log.Error().Err(err), r.Context()).Msg("Failed to validate car payload")
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
		// A link the catalogue refuses is the caller's input, not a rule the
		// database caught late, so it is answered without the warning below.
		if problem, ok := generationProblem(err); ok {
			writeProblem(w, r, problem)
			return
		}

		if problem, known := carWriteProblem(err); known {
			// The validate tags above should have caught every one of these, so
			// reaching here means a rule is enforced in only one of the two
			// places. Logged as a warning: the caller is answered correctly, but
			// the mismatch is ours to fix.
			withUser(log.Warn().Err(err), r.Context()).Msg("Car rejected by the database after passing validation")
			writeProblem(w, r, problem)
			return
		}

		withUser(log.Error().Err(err), r.Context()).Msg("Failed to create car")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusCreated, car)
}

func (h *CarHandler) UpdateCar(w http.ResponseWriter, r *http.Request) {
	var request domain.UpdateCar

	body := http.MaxBytesReader(w, r.Body, 1048576) // Limit request body to 1MB

	decoder := json.NewDecoder(body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&request); err != nil {
		writeProblem(w, r, malformedBody("The body must be a JSON object describing the car, using only the fields this endpoint defines."))
		return
	}

	if decoder.More() {
		writeProblem(w, r, malformedBody("The body must contain exactly one JSON object."))
		return
	}

	// Whitespace is trimmed before the rules run, so blank values fail them and
	// padded ones are stored without the padding.
	request.Normalize()

	if err := validate.Struct(request); err != nil {
		var validateErrs validator.ValidationErrors
		if !errors.As(err, &validateErrs) {
			// Not the caller's fault: a bad tag or an unsupported type.
			withUser(log.Error().Err(err), r.Context()).Msg("Failed to validate car payload")
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

	// Caught here as well as in the repository: the answer is the same, and a
	// body that asks for nothing does not need a database round trip to refuse.
	if !request.HasChanges() {
		writeProblem(w, r, Problem{
			Type:   typeValidationFailed,
			Title:  "The car details did not validate",
			Status: http.StatusUnprocessableEntity,
			Detail: "Provide at least one field to update.",
		})
		return
	}

	id := chi.URLParam(r, "id")

	uId, err := uuid.Parse(id)

	if err != nil {
		writeProblem(w, r, Problem{
			Type:   typeMalformedParam,
			Title:  "The param could not be read",
			Status: http.StatusNotFound,
			Detail: "The param must be a UUID.",
		})
		return
	}
	request.Id = uId
	request.UserId = domain.MustUserID(r.Context())

	car, err := h.carService.UpdateCar(r.Context(), request)

	if err != nil {
		// A link the catalogue refuses is the caller's input, not a rule the
		// database caught late, so it is answered without the warning below.
		if problem, ok := generationProblem(err); ok {
			writeProblem(w, r, problem)
			return
		}

		if problem, known := carWriteProblem(err); known {
			// The validate tags above should have caught every one of these, so
			// reaching here means a rule is enforced in only one of the two
			// places. Logged as a warning: the caller is answered correctly, but
			// the mismatch is ours to fix.
			withUser(log.Warn().Err(err), r.Context()).Msg("Car rejected by the database after passing validation")
			writeProblem(w, r, problem)
			return
		}

		withUser(log.Error().Err(err), r.Context()).Msg("Failed to update car")
		serverProblem(w, r)
		return
	}

	writeJSON(w, http.StatusOK, car)
}

// generationProblem answers a catalogue link the service refused: a car that
// disagrees with its generation, reported on each field that disagrees, or a
// generation that does not exist, reported on generationId.
func generationProblem(err error) (Problem, bool) {
	var mismatch *domain.GenerationMismatchError

	switch {
	case errors.As(err, &mismatch):
		params := make([]InvalidParam, 0, len(mismatch.Fields))
		for _, field := range mismatch.Fields {
			params = append(params, InvalidParam{Name: field, Reason: mismatchReason(field, mismatch)})
		}

		return Problem{
			Type:          typeValidationFailed,
			Title:         "The car details did not validate",
			Status:        http.StatusUnprocessableEntity,
			InvalidParams: params,
		}, true

	case errors.Is(err, domain.ErrUnknownGeneration):
		return Problem{
			Type:          typeValidationFailed,
			Title:         "The car details did not validate",
			Status:        http.StatusUnprocessableEntity,
			InvalidParams: []InvalidParam{{Name: "generationId", Reason: "This generation does not exist in the catalogue"}},
		}, true
	}

	return Problem{}, false
}

// mismatchReason says what the linked generation expects of a field. The year
// names the range, so the reply says which years would do and not only that
// this one does not.
func mismatchReason(field string, mismatch *domain.GenerationMismatchError) string {
	switch field {
	case "make":
		return "This make does not match the linked catalogue generation"
	case "model":
		return "This model does not match the linked catalogue generation"
	default:
		if mismatch.EndYear == nil {
			return fmt.Sprintf("This year must be %d or later for the linked generation", mismatch.StartYear)
		}
		return fmt.Sprintf("This year must be between %d and %d for the linked generation", mismatch.StartYear, *mismatch.EndYear)
	}
}
