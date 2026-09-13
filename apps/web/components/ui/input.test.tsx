import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'

import { Input } from './input'

describe('Input', () => {
  it('renders the input component', () => {
    render(<Input placeholder="Enter text" />)
    const inputElement = screen.getByPlaceholderText(/Enter text/i)
    expect(inputElement).toBeInTheDocument()
  })

  it('renders the label when provided', () => {
    render(<Input label="Test Label" />)
    const labelElement = screen.getByText(/TEST LABEL/i)
    expect(labelElement).toBeInTheDocument()
  })

  it('renders the error message when provided', () => {
    render(<Input error="This is an error" />)
    const errorElement = screen.getByText(/This is an error/i)
    expect(errorElement).toBeInTheDocument()
  })

  it('renders the helper text when provided', () => {
    render(<Input helperText="This is helper text" />)
    const helperTextElement = screen.getByText(/This is helper text/i)
    expect(helperTextElement).toBeInTheDocument()
  })

  it('renders the left icon when provided', () => {
    render(<Input leftIcon={<span data-testid="left-icon">L</span>} />)
    const leftIconElement = screen.getByTestId('left-icon')
    expect(leftIconElement).toBeInTheDocument()
  })

  it('renders the right icon when provided', () => {
    render(<Input rightIcon={<span data-testid="right-icon">R</span>} />)
    const rightIconElement = screen.getByTestId('right-icon')
    expect(rightIconElement).toBeInTheDocument()
  })

  it('renders the input component with disabled state', () => {
    render(<Input placeholder="Enter text" disabled />)
    const inputElement = screen.getByPlaceholderText(/Enter text/i)
    expect(inputElement).toBeInTheDocument()
    expect(inputElement).toBeDisabled()
  })

  it('renders the input component with error state', () => {
    render(<Input placeholder="Enter text" error="This is an error" />)
    const inputElement = screen.getByPlaceholderText(/Enter text/i)
    expect(inputElement).toBeInTheDocument()
    expect(inputElement).toHaveAttribute('aria-invalid', 'true')
  })
})
describe('Input labelling', () => {
  it('ties the label to the field, so clicking it focuses the input', async () => {
    const user = userEvent.setup()
    render(<Input label="Engine" />)

    await user.click(screen.getByText('ENGINE'))

    expect(screen.getByLabelText(/ENGINE/i)).toHaveFocus()
  })

  it('announces the error with the field rather than beside it', () => {
    render(<Input label="Year" error="This field must be 1885 or more" />)

    const field = screen.getByLabelText(/YEAR/i)

    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('This field must be 1885 or more')
  })

  it('gives two inputs on one page distinct ids', () => {
    render(
      <>
        <Input label="Make" />
        <Input label="Model" />
      </>
    )

    expect(screen.getByLabelText(/MAKE/i).id).not.toBe(screen.getByLabelText(/MODEL/i).id)
  })
})

describe('Input spacing', () => {
  // The label-to-field gap used to come from whatever wrapped the Input:
  // flush against the field in a plain div, 20px away inside space-y-5.
  // Keeping all three parts in one element is what makes the gap the
  // component's own, and this fails if it goes back to a fragment.
  it('keeps its label, field and message in one block, so a parent cannot space them apart', () => {
    const { container } = render(<Input label="Engine" helperText="Helps Rex" />)

    expect(container.children).toHaveLength(1)

    const block = container.firstElementChild
    expect(block).toContainElement(screen.getByText('ENGINE'))
    expect(block).toContainElement(screen.getByLabelText(/ENGINE/i))
    expect(block).toContainElement(screen.getByText('Helps Rex'))
  })
})
