package waitlist_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/willikay11/wrench/api/internal/core/domain"
	"github.com/willikay11/wrench/api/internal/core/services/waitlist"
)

type mockWaitlistRepository struct {
	savedWaitlist *domain.Waitlist
	saveErr       error
}

func (m *mockWaitlistRepository) Save(w *domain.Waitlist) error {
	if m.saveErr != nil {
		return m.saveErr
	}
	m.savedWaitlist = w
	return nil
}

func TestJoinWaitlist(t *testing.T) {

	type testCase struct {
		name          string
		email         string
		expectedEmail string
		wantErr       error
	}

	t.Run("should save waitlist entry and return it", func(t *testing.T) {

		tests := []testCase{
			{name: "valid email", email: "willikay11@gmail.com", expectedEmail: "willikay11@gmail.com", wantErr: nil},
			{name: "invalid email", email: "not-an-email", expectedEmail: "", wantErr: domain.ErrInvalidEmail},
			{name: "email with spaces", email: " william@gmail.com ", expectedEmail: "william@gmail.com", wantErr: nil},
			{name: "empty email", email: "", expectedEmail: "", wantErr: domain.ErrInvalidEmail},
		}

		for _, tc := range tests {
			mockRepo := &mockWaitlistRepository{}
			service := waitlist.NewService(mockRepo)

			got, err := service.JoinWaitlist(tc.email)

			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				assert.Nil(t, mockRepo.savedWaitlist) // must not touch the repo
				return
			}

			assert.NoError(t, err)
			assert.Equal(t, tc.expectedEmail, got.Email)
		}

	})
}
