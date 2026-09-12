import { describe,expect,it } from 'vitest'
import { LEGAL_DOCUMENTS } from '@/lib/legal-documents'

describe('launch legal documents',()=>{
  it('publishes every agreement linked from authentication',()=>{expect(Object.keys(LEGAL_DOCUMENTS)).toEqual(['terms','privacy','cookies','acceptable','ai']);for(const document of Object.values(LEGAL_DOCUMENTS)){expect(document.title.length).toBeGreaterThan(3);expect(document.sections.length).toBeGreaterThanOrEqual(4)}})
  it('explains BYOK handling without claiming fabricated balances',()=>{const text=JSON.stringify(LEGAL_DOCUMENTS);expect(text).toContain('encrypted at rest');expect(text).toContain('does not fabricate provider balances');expect(text).not.toMatch(/lorem ipsum|coming soon|placeholder/i)})
})
