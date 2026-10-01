import { assertEquals } from 'jsr:@std/assert@1'
import { formDoStripe } from './stripe.ts'

Deno.test('o corpo do Stripe usa a notação de colchetes para objetos e listas', () => {
  assertEquals(
    formDoStripe({ mode: 'subscription', line_items: [{ price: 'p', quantity: 2 }], metadata: { workspace_id: 'w' }, nada: undefined }).join('&'),
    'mode=subscription&line_items%5B0%5D%5Bprice%5D=p&line_items%5B0%5D%5Bquantity%5D=2&metadata%5Bworkspace_id%5D=w',
  )
})
