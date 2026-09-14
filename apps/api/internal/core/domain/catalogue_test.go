package domain_test

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

func TestNewCatalogueSearchTrimsAndDefaults(t *testing.T) {
	search, err := domain.NewCatalogueSearch("  nis  ", nil)

	require.NoError(t, err)
	require.Equal(t, "nis", search.Text)
	require.Equal(t, domain.DefaultCatalogueResults, search.Limit)
}

func TestNewCatalogueSearchAcceptsTheLimitBoundaries(t *testing.T) {
	for _, limit := range []int{1, domain.MaxCatalogueResults} {
		search, err := domain.NewCatalogueSearch("", &limit)

		require.NoError(t, err, "limit %d", limit)
		require.Equal(t, limit, search.Limit)
	}
}

// Refused, not clamped — the same rule the car list follows.
func TestNewCatalogueSearchRefusesALimitOutsideTheRange(t *testing.T) {
	for _, limit := range []int{0, -1, domain.MaxCatalogueResults + 1} {
		_, err := domain.NewCatalogueSearch("", &limit)

		require.ErrorIs(t, err, domain.ErrInvalidLimit, "limit %d", limit)
	}
}

// Counted in characters, not bytes, so a search for "Škoda" is not charged for
// its encoding.
func TestNewCatalogueSearchLimitsTextByCharacters(t *testing.T) {
	_, err := domain.NewCatalogueSearch(strings.Repeat("Š", domain.MaxCatalogueSearchLength), nil)
	require.NoError(t, err)

	_, err = domain.NewCatalogueSearch(strings.Repeat("Š", domain.MaxCatalogueSearchLength+1), nil)
	require.ErrorIs(t, err, domain.ErrSearchTooLong)
}

func TestGenerationCoversItsYearRange(t *testing.T) {
	end := 2009
	z33 := domain.VehicleGeneration{StartYear: 2002, EndYear: &end}

	require.False(t, z33.Covers(2001))
	require.True(t, z33.Covers(2002))
	require.True(t, z33.Covers(2009))
	require.False(t, z33.Covers(2010))
}

// A nil end year is a generation still in production, so every later year is
// inside it rather than outside.
func TestGenerationWithNoEndYearIsOngoing(t *testing.T) {
	nd := domain.VehicleGeneration{StartYear: 2015}

	require.False(t, nd.Covers(2014))
	require.True(t, nd.Covers(2015))
	require.True(t, nd.Covers(domain.MaxCarYear))
}
