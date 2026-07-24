import { render } from '@testing-library/react'
import { screen } from '@testing-library/dom'
import { describe, it, expect } from 'vitest'

import { Hero } from './forEveryone'

describe('Hero', () => {
    it('renders the hero component', () => {
        render(<Hero />)
        const heroElement = screen.getByText(/Your AI mechanic that knows your car inside and out./i)
        expect(heroElement).toBeInTheDocument()
    })

    it('renders the get started button in the hero', () => {
        render(<Hero />)
        const getStartedButton = screen.getByRole('button', { name: /Get Started/i })
        expect(getStartedButton).toBeInTheDocument()
    })

    it('renders the see how it works button in the hero', () => {
        render(<Hero />)
        const seeHowItWorksButton = screen.getByRole('button', { name: /See how it works/i })
        expect(seeHowItWorksButton).toBeInTheDocument()
    })

    it('renders the card component in the hero', () => {
        render(<Hero />)
        const cardElement = screen.getByText(/Why is my 350Z misfiring at boost?/i)
        expect(cardElement).toBeInTheDocument()
    })
})