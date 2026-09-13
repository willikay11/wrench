package domain_test

import (
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/willikay11/wrench/api/internal/core/domain"
)

/*
The cursor is the part of the list endpoint a client cannot see into and cannot
work around, so it is tested on its own. What matters is that a cursor survives
the round trip exactly — a createdAt that loses precision moves the page
boundary — and that nothing unreadable is ever accepted as a position.
*/

func TestCarCursorSurvivesTheRoundTrip(t *testing.T) {
	// A time with nanoseconds and a non-UTC zone: the two things a careless
	// encoding drops, and either one shifts the page boundary.
	cursor := domain.CarCursor{
		CreatedAt: time.Date(2026, 9, 10, 8, 30, 15, 123456789, time.FixedZone("EAT", 3*60*60)),
		Id:        uuid.New(),
	}

	decoded, err := domain.DecodeCarCursor(cursor.Encode())

	require.NoError(t, err)
	require.Equal(t, cursor.Id, decoded.Id)
	require.True(t, cursor.CreatedAt.Equal(decoded.CreatedAt), "got %v want %v", decoded.CreatedAt, cursor.CreatedAt)
}

// The encoding must be URL-safe: a cursor goes back as a query parameter, and
// standard base64's + and / would be mangled in transit.
func TestCarCursorIsUrlSafe(t *testing.T) {
	for range 50 {
		encoded := domain.CarCursor{CreatedAt: time.Now(), Id: uuid.New()}.Encode()

		require.NotContains(t, encoded, "+")
		require.NotContains(t, encoded, "/")
		require.NotContains(t, encoded, "=")
	}
}

func TestDecodeCarCursorRefusesAnythingItCannotTrust(t *testing.T) {
	valid := domain.CarCursor{CreatedAt: time.Now(), Id: uuid.New()}

	cases := []struct {
		name   string
		cursor string
	}{
		{name: "not base64", cursor: "!!!not base64!!!"},
		{name: "base64 of nonsense", cursor: base64.RawURLEncoding.EncodeToString([]byte("hello"))},
		{name: "base64 of a JSON array", cursor: base64.RawURLEncoding.EncodeToString([]byte(`[1,2,3]`))},
		{
			// A cursor with no id compares against nothing and would quietly
			// widen the page boundary.
			name:   "missing the id",
			cursor: base64.RawURLEncoding.EncodeToString([]byte(`{"createdAt":"2026-09-10T08:00:00Z"}`)),
		},
		{
			name:   "a zero id",
			cursor: base64.RawURLEncoding.EncodeToString([]byte(`{"createdAt":"2026-09-10T08:00:00Z","id":"00000000-0000-0000-0000-000000000000"}`)),
		},
		{
			name:   "missing the timestamp",
			cursor: base64.RawURLEncoding.EncodeToString([]byte(`{"id":"` + uuid.New().String() + `"}`)),
		},
		{
			name:   "a field it does not define",
			cursor: base64.RawURLEncoding.EncodeToString([]byte(`{"createdAt":"2026-09-10T08:00:00Z","id":"` + uuid.New().String() + `","userId":"` + uuid.New().String() + `"}`)),
		},
		{
			// One character flipped: a corrupted cursor must be refused, never
			// silently treated as a different position.
			name:   "a truncated cursor",
			cursor: valid.Encode()[:len(valid.Encode())-4],
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := domain.DecodeCarCursor(tc.cursor)
			require.ErrorIs(t, err, domain.ErrInvalidCursor)
		})
	}
}

// A cursor is a position and nothing else. Even one carrying an owner must not
// be able to say whose cars are listed — the type has no field for it.
func TestCarCursorCarriesNoOwner(t *testing.T) {
	encoded := domain.CarCursor{CreatedAt: time.Now(), Id: uuid.New()}.Encode()

	raw, err := base64.RawURLEncoding.DecodeString(encoded)
	require.NoError(t, err)

	require.NotContains(t, strings.ToLower(string(raw)), "user")
}

func TestNewCarQueryAppliesTheSpecsPagingRules(t *testing.T) {
	userID := uuid.New()

	t.Run("an absent limit takes the default", func(t *testing.T) {
		query, err := domain.NewCarQuery(userID, nil, nil)

		require.NoError(t, err)
		require.Equal(t, domain.DefaultCarPageSize, query.Limit)
		require.Equal(t, userID, query.UserId)
		require.Nil(t, query.Cursor)
	})

	t.Run("the accepted boundaries", func(t *testing.T) {
		for _, limit := range []int{1, domain.MaxCarPageSize} {
			query, err := domain.NewCarQuery(userID, &limit, nil)

			require.NoError(t, err, "limit %d", limit)
			require.Equal(t, limit, query.Limit)
		}
	})

	// Refused, not clamped: returning 50 rows to a request for 500 reports a
	// page size the client never asked for and hides the mistake.
	t.Run("the rejected boundaries", func(t *testing.T) {
		for _, limit := range []int{0, -1, domain.MaxCarPageSize + 1, 1000} {
			_, err := domain.NewCarQuery(userID, &limit, nil)

			require.ErrorIs(t, err, domain.ErrInvalidLimit, "limit %d", limit)
		}
	})
}
