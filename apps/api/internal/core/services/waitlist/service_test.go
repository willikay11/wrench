package waitlist_test

import (
	"testing"

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

	service := waitlist.NewService(mockRepo)

	email := "willikay11@gmail.com"

	_, err := service.JoinWaitlist(email)

	if err != nil {
		t.Errorf("Expected no error, got %v", err)
	}
}
