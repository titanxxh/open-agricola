import { expect, it } from 'vitest'
import { patchCommunityCardsMarkdown } from '../code-gen'
it('preserves an existing community listing without duplicating it', () => {
 const source = '<!-- community-card-entries:begin -->\n<!-- community-card-entries:end -->'
 const entry = {card_id:'CUSTOM_DeliveryAcceptance',card_name:'Delivery acceptance',card_type:'minor' as const,github_login:'reviewer',pr_number:1}
 const first = patchCommunityCardsMarkdown(source,entry)
 const updated = patchCommunityCardsMarkdown(first,{...entry,pr_number:2})
 expect(updated.match(/CUSTOM_DeliveryAcceptance/g)).toHaveLength(1)
 expect(updated).toContain('#1')
 expect(updated).toBe(first)
})
