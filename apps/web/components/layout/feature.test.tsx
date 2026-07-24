import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { Feature } from './feature'

describe('Feature', () => {
    it('renders the feature component', () => {
        render(<Feature />)
        const featureElement = screen.getByText(/Garage Management/i)
        expect(featureElement).toBeInTheDocument()
    })

    it('renders the AI assistant feature in the feature component', () => {
        render(<Feature />)
        const aiAssistantFeature = screen.getByText(/AI assistant/i)
        expect(aiAssistantFeature).toBeInTheDocument()
    })

    it('renders the build planner feature in the feature component', () => {
        render(<Feature />)
        const buildPlannerFeature = screen.getByText(/Build planner/i)
        expect(buildPlannerFeature).toBeInTheDocument()
    })
})