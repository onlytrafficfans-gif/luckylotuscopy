import { describe, expect, it } from 'vitest'
import { generateBackendArtifacts } from '@/lib/backend-artifacts'
import { createProjectSpecification } from '@/lib/project-specification'

describe('backend artifact generation', () => {
  it('generates executable PostgreSQL and typed model artifacts', () => {
    const specification = createProjectSpecification({ name: 'Bookings', prompt: 'Manage bookings', targets: ['web'] })
    specification.data.entities = [
      { id: 'customer', name: 'Customer', fields: [{ id: 'email', name: 'Email', type: 'email', required: true }] },
      { id: 'booking', name: 'Booking', fields: [
        { id: 'customer-id', name: 'Customer', type: 'relation', required: true, relationEntityId: 'customer' },
        { id: 'starts-at', name: 'Starts at', type: 'datetime', required: true },
        { id: 'notes', name: 'Notes', type: 'text', required: false },
      ] },
    ]
    const files = generateBackendArtifacts(specification)
    const sql = files.find(file => file.path === 'backend/schema.sql')!.content
    const types = files.find(file => file.path === 'backend/models.ts')!.content
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "customer"')
    expect(sql).toContain('"customer-id" uuid NOT NULL REFERENCES "customer"(id)')
    expect(sql).toContain('"starts-at" timestamptz NOT NULL')
    expect(types).toContain('export interface Booking')
    expect(types).toContain("'customer-id': string")
  })

  it('does not emit pretend tables when the project has no entities', () => {
    const specification = createProjectSpecification({ name: 'Empty', prompt: 'No data', targets: ['web'] })
    expect(() => generateBackendArtifacts(specification)).toThrow(/entity/)
  })
})
