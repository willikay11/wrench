package waitlist_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/services/waitlist"
)

type mockWaitlistRepository struct {
	savedWaitlist *domain.Waitlist
}

func (m *mockWaitlistRepository) Save(w *domain.Waitlist) error {
	m.savedWaitlist = w
	return nil
}

func TestJoinWaitlist(t *testing.T) {
	mockRepo := &mockWaitlistRepository{}

	type testCase struct {
		email string
	}
	t.Run("should save waitlist entry and return it", func(t *testing.T) {

		tests := []testCase{
			{email: "willikay11@gmail.com"},
		}

		for _, tc := range tests {
			service := waitlist.NewService(mockRepo)

			_, err := service.JoinWaitlist(tc.email)

			assert.NoError(t, err)
		}

	})
}
