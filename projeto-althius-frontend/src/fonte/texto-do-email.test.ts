import { describe, expect, it } from 'vitest'
import { textoDaResposta } from './texto-do-email'

// A resposta real do primeiro ciclo (Outlook), resumida: texto, assinatura com imagem e o histórico citado.
const RESPOSTA_DO_OUTLOOK = `<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">
<style type="text/css" style="display:none;"> P {margin-top:0;margin-bottom:0;} </style>
</head>
<body dir="ltr">
<div class="elementToProof" style="font-family: Aptos; font-size: 12pt;">
Oi, recebido</div>
<div id="Signature" class="elementToProof">
<div class="elementToProof"><br></div>
<p class="elementToProof" style="margin: 0cm;">Atenciosamente / Best regards,</p>
<div class="elementToProof"><br><span><img id="x_image_1" src="cid:dbfa57f6"></span><br></div>
<p class="elementToProof">&nbsp;</p>
</div>
<div id="appendonsend"></div>
<hr style="display:inline-block;width:98%" tabindex="-1">
<div id="divRplyFwdMsg" dir="ltr"><font face="Calibri"><b>De:</b> althius.relacionamento@gmail.com<br>
<b>Enviado:</b> sábado, 26 de setembro de 2026 21:26<br><b>Assunto:</b> aaaa</font></div>
<div class="BodyFragment"><div class="PlainText">aaaa{{conta.nome}}<br></div></div>
</body>
</html>`

describe('Texto da resposta recebida', () => {
  it('mostra o que o Contato escreveu numa resposta do Outlook, sem HTML, estilo nem histórico citado', () => {
    expect(textoDaResposta(RESPOSTA_DO_OUTLOOK)).toBe('Oi, recebido\n\nAtenciosamente / Best regards,')
  })

  it('corta o histórico citado de uma resposta do Gmail', () => {
    const gmail = '<div dir="ltr">Podemos falar amanhã?<br>Abraço</div><br><div class="gmail_quote"><div class="gmail_attr">Em sáb., escreveu:</div><blockquote>texto antigo</blockquote></div>'
    expect(textoDaResposta(gmail)).toBe('Podemos falar amanhã?\nAbraço')
  })

  it('texto puro volta como veio', () => {
    expect(textoDaResposta('  Podemos falar amanhã?\nAbraço  ')).toBe('Podemos falar amanhã?\nAbraço')
  })

  it('nada do HTML vira marcação na página: um script no corpo sai como nada', () => {
    expect(textoDaResposta('<p>Oi</p><script>alert(1)</script><img src=x onerror="alert(2)">')).toBe('Oi')
  })
})
