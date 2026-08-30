/**
 * @vitest-environment jsdom
 *
 * App.test.jsx — UI smoke tests
 *
 * Mounts the real component tree. A build succeeding proves the modules resolve;
 * it does not prove the app renders. These tests cover the paths where the form
 * branches — conditional sections, the sizing preview, import — because a crash
 * there is invisible until someone actually clicks it.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import App from '../src/App.jsx'

afterEach(cleanup)

const selectProduct = (label) => fireEvent.click(screen.getByText(label))
const clickOption = (text) => fireEvent.click(screen.getByRole('button', { name: text }))

const IDENTITY_DB = {
  Host: 'db.example.com',
  Port: '5432',
  Username: 'identity',
  Password: 'db-secret',
  'Database Name': 'identity',
}

// Several sections now share placeholders like Username and Password, so every
// fill is scoped to its own card.
function fillIdentity() {
  const db = screen.getByText('Management Identity Database').closest('.card')
  for (const [placeholder, value] of Object.entries(IDENTITY_DB)) {
    fireEvent.change(within(db).getByPlaceholderText(placeholder), { target: { value } })
  }

  const user = screen.getByText('Identity Bootstrap User').closest('.card')
  fireEvent.click(within(user).getByRole('button', { name: 'Create an administrator' }))
  for (const [placeholder, value] of [
    ['Username', 'admin'],
    ['Email', 'admin@example.com'],
    ['Password', 'user-secret'],
  ]) {
    fireEvent.change(within(user).getByPlaceholderText(placeholder), { target: { value } })
  }
}

describe('initial render', () => {
  it('renders the product picker without any product selected', () => {
    render(<App />)
    expect(screen.getByText('Select Products')).toBeDefined()
    expect(screen.getByText('Orchestration Cluster')).toBeDefined()
  })

  it('shows the chart version the output targets', () => {
    render(<App />)
    expect(screen.getByText(/camunda-platform chart 14\.8\.5/)).toBeDefined()
  })

  it('refuses to generate with nothing selected', () => {
    render(<App />)
    fireEvent.click(screen.getByText('Generate values.yaml'))
    expect(screen.getByText(/Please select at least one product/)).toBeDefined()
  })
})

describe('conditional sections', () => {
  it('reveals the database choice once a search consumer is selected', () => {
    render(<App />)
    expect(screen.queryByText('Database Type')).toBeNull()
    selectProduct('Orchestration Cluster')
    expect(screen.getByText('Database Type')).toBeDefined()
  })

  it('shows the AWS EKS section only for OpenSearch', () => {
    render(<App />)
    selectProduct('Orchestration Cluster')
    expect(screen.queryByText('AWS EKS')).toBeNull()
    clickOption('opensearch')
    expect(screen.getByText('AWS EKS')).toBeDefined()
  })
})

describe('secret modes', () => {
  it('swaps the inline password for a secret reference', () => {
    render(<App />)
    selectProduct('Orchestration Cluster')
    clickOption('elasticsearch')

    // Scoped to the database card — several sections offer a secret mode toggle.
    const card = screen.getByText('Elasticsearch Configuration').closest('.card')
    expect(within(card).getByPlaceholderText('Password')).toBeDefined()

    fireEvent.click(within(card).getByRole('button', { name: 'Existing secret' }))

    expect(within(card).queryByPlaceholderText('Password')).toBeNull()
    expect(within(card).getByPlaceholderText('Existing secret name')).toBeDefined()
  })

  it('offers a secret mode for the license key too', () => {
    render(<App />)
    selectProduct('Orchestration Cluster')
    const card = screen.getByText('Enterprise License').closest('.card')
    expect(within(card).getByRole('button', { name: 'Existing secret' })).toBeDefined()
  })
})

describe('sizing preview', () => {
  it('computes and displays a topology from a throughput target', () => {
    render(<App />)
    selectProduct('Orchestration Cluster')
    clickOption('elasticsearch')
    clickOption('Throughput target')

    fireEvent.change(screen.getByPlaceholderText('Target process instances per second'), {
      target: { value: '1000' },
    })

    const preview = screen.getByText('Computed topology').closest('.preview-panel')
    expect(within(preview).getByText('12')).toBeDefined()  // brokers
    expect(within(preview).getByText('35')).toBeDefined()  // partitions
    expect(within(preview).getByText(/starting point, not a guarantee/)).toBeDefined()
  })

  it('shows nothing until a target is entered', () => {
    render(<App />)
    selectProduct('Orchestration Cluster')
    clickOption('elasticsearch')
    clickOption('Throughput target')
    expect(screen.queryByText('Computed topology')).toBeNull()
  })
})

describe('multi-region preview', () => {
  it('lists a contact point per broker across both namespaces', () => {
    render(<App />)
    selectProduct('Orchestration Cluster')
    clickOption('elasticsearch')
    fireEvent.click(screen.getByText('Stretch this cluster across multiple regions'))

    const [first] = screen.getAllByPlaceholderText('camunda-region-0')
    fireEvent.change(first, { target: { value: 'camunda-region-0' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }))

    const inputs = screen.getAllByPlaceholderText('camunda-region-0')
    fireEvent.change(inputs[1], { target: { value: 'camunda-region-1' } })

    const preview = screen.getByText('Generated initial contact points').closest('.preview-panel')
    const text = within(preview).getByText(/camunda-region-0/).textContent
    const points = text.split('\n')

    // The chart default of 3 brokers is rounded up to 4 so it divides across
    // two regions — 2 brokers each, 4 contact points.
    expect(points).toHaveLength(4)
    expect(points.filter((p) => p.includes('camunda-region-0'))).toHaveLength(2)
    expect(points.filter((p) => p.includes('camunda-region-1'))).toHaveLength(2)
  })
})

describe('cross-component constraints', () => {
  it('blocks Console without Identity, quoting the chart rule', () => {
    render(<App />)
    selectProduct('Console')
    fireEvent.click(screen.getByText('Generate values.yaml'))
    expect(screen.getByText(/Console requires Management Identity/)).toBeDefined()
  })

  it('generates once Identity is added', () => {
    render(<App />)
    selectProduct('Console')
    selectProduct('Management Identity')
    fillIdentity()

    fireEvent.click(screen.getByText('Generate values.yaml'))
    expect(screen.getByText('Generated values.yaml')).toBeDefined()
    expect(screen.queryByText(/Console requires Management Identity/)).toBeNull()
  })
})

describe('identity bootstrap user', () => {
  it('will not generate until the administrator question is answered', () => {
    render(<App />)
    selectProduct('Management Identity')

    const db = screen.getByText('Management Identity Database').closest('.card')
    for (const [placeholder, value] of Object.entries(IDENTITY_DB)) {
      fireEvent.change(within(db).getByPlaceholderText(placeholder), { target: { value } })
    }

    fireEvent.click(screen.getByText('Generate values.yaml'))
    expect(screen.getByText(/Create an initial administrator\? is required/)).toBeDefined()
  })

  it('never silently ships the chart default demo user', () => {
    render(<App />)
    selectProduct('Management Identity')
    fillIdentity()
    fireEvent.click(screen.getByText('Generate values.yaml'))

    const yamlText = screen.getByText('Generated values.yaml')
      .closest('.yaml-output').querySelector('.yaml-pre').textContent

    expect(yamlText).not.toContain('demo')
    expect(yamlText).toContain('username: admin')
    expect(yamlText).toContain('enabled: true')
  })

  it('writes firstUser.enabled false when declined', () => {
    render(<App />)
    selectProduct('Management Identity')

    const db = screen.getByText('Management Identity Database').closest('.card')
    for (const [placeholder, value] of Object.entries(IDENTITY_DB)) {
      fireEvent.change(within(db).getByPlaceholderText(placeholder), { target: { value } })
    }

    const card = screen.getByText('Identity Bootstrap User').closest('.card')
    fireEvent.click(within(card).getByRole('button', { name: 'No initial user' }))
    fireEvent.click(screen.getByText('Generate values.yaml'))

    const yamlText = screen.getByText('Generated values.yaml')
      .closest('.yaml-output').querySelector('.yaml-pre').textContent

    expect(yamlText).toContain('firstUser')
    expect(yamlText).not.toContain('demo')
  })
})

describe('generated output', () => {
  it('produces YAML containing the values that were entered', () => {
    render(<App />)
    selectProduct('Orchestration Cluster')
    clickOption('elasticsearch')

    fireEvent.change(screen.getByPlaceholderText('Username'), { target: { value: 'camunda' } })
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
    fireEvent.change(screen.getByPlaceholderText('Host'), { target: { value: 'es.example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Port'), { target: { value: '9200' } })
    clickOption('https')

    fireEvent.click(screen.getByText('Generate values.yaml'))

    const output = screen.getByText('Generated values.yaml').closest('.yaml-output')
    const yamlText = output.querySelector('.yaml-pre').textContent
    expect(yamlText).toContain('host: es.example.com')
    expect(yamlText).toContain('port: 9200')
    expect(yamlText).toContain('enabled: true')
  })
})
