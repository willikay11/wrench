package domain_test

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

func z33() domain.GenerationMatch {
	end := 2009
	return domain.GenerationMatch{
		Generation: domain.VehicleGeneration{Id: uuid.New(), StartYear: 2002, EndYear: &end, BodyStyle: "coupe"},
		MakeName:   "Nissan",
		ModelName:  "350Z",
	}
}

func TestACarThatAgreesWithItsGenerationHasNoDisagreements(t *testing.T) {
	require.Empty(t, z33().Disagreements("Nissan", "350Z", 2005))
}

// What a person types is not what the catalogue stores, and that is fine.
func TestDisagreementsIgnoreCaseAndSurroundingSpace(t *testing.T) {
	require.Empty(t, z33().Disagreements("  nissan ", "350z", 2002))
}

func TestDisagreementsNameEachFieldThatDiffers(t *testing.T) {
	cases := []struct {
		name  string
		make  string
		model string
		year  int
		want  []string
	}{
		{name: "another make", make: "Subaru", model: "350Z", year: 2005, want: []string{"make"}},
		{name: "another model of the same make", make: "Nissan", model: "370Z", year: 2005, want: []string{"model"}},
		{name: "a year before the generation", make: "Nissan", model: "350Z", year: 2001, want: []string{"year"}},
		{name: "a year after the generation", make: "Nissan", model: "350Z", year: 2010, want: []string{"year"}},
		{name: "everything", make: "Mazda", model: "RX-7", year: 1993, want: []string{"make", "model", "year"}},
		// Close is not the same: a link that tolerated this would show the wrong car.
		{name: "a near miss on the model", make: "Nissan", model: "350", year: 2005, want: []string{"model"}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, z33().Disagreements(tc.make, tc.model, tc.year))
		})
	}
}

func TestGenerationMismatchErrorNamesTheFields(t *testing.T) {
	var err error = &domain.GenerationMismatchError{Fields: []string{"make", "year"}, StartYear: 2002}

	var mismatch *domain.GenerationMismatchError
	require.True(t, errors.As(err, &mismatch))
	require.Equal(t, []string{"make", "year"}, mismatch.Fields)
	require.Contains(t, err.Error(), "make, year")
}
