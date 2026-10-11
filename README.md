# BR LIFT — Web

Frontend React/TypeScript de atendimento técnico, inspeções e gestão.
Este repositório contém somente o frontend. Backend e banco pertencem
ao repositório irmão stg-inspector-api.

Conferência de fluxo V0/proposta na documentação local, fora dos repositórios.
A revisão de cronograma exige `npm run db:migrate` na API e atualização conjunta
da API, web e mobile (contrato 4), sem apagar banco ou recriar login.

## Rodar

1. Na API, siga o README para iniciar PostgreSQL + API e criar seu usuário.
   A API deve responder em http://localhost:3333/health.
2. Aqui, com Node 22.12+ (ou 24):

       npm ci
       npm run dev

3. Abra http://localhost:5174 e entre com o usuário criado.

Administradores usam **Cadastros** para criar, editar e desativar usuários.
Cada novo acesso precisa de nome, CPF, e-mail, senha inicial e perfil; o
cadastro de técnico correspondente é criado junto. Usuários não administradores
veem **Editar perfil** no mesmo lugar: podem alterar seu nome, CPF, e-mail e
senha após confirmar a senha atual, mas não o perfil de acesso.
Na gestão, técnicos veem somente atendimentos em que fazem parte da equipe e
inspeções realizadas por eles. O filtro de técnico é exibido apenas para admins.

Não é obrigatório criar .env local. O Vite encaminha /api para localhost:3333.
.env.example documenta a URL pública, sem segredos.
Outra porta de API: API_PROXY_TARGET=http://localhost:PORTA.

## Testar

Campos de data (formulários, cronograma, filtros e vistorias): clique no campo
para abrir o calendário sem interromper a digitação. Dia/mês avançam após dois
algarismos; Tab ou / também avança. O ano recebe quatro algarismos. Escape fecha,
e o calendário permite escolher a data, Hoje ou Limpar. Datas inválidas não são
enviadas como se fossem válidas.

Em B. Equipamento, selecione um equipamento do cliente. Criação e alterações
permanentes são feitas pelos botões + Equipamento / Editar equipamento e seu
modal. Os dados do cadastro ficam cinza e sem foco na tela principal.
KM e horímetros inferior/superior são editáveis diretamente, inclusive N/A;
são exclusivos do atendimento/data, não entram no cadastro. Horímetros ficam
somente em Equipamento, não nos dias do cronograma.
Salvar o cadastro não substitui Salvar/Finalizar o atendimento.

Em D. Peças, use **Adicionar peça ao atendimento** para incluir uma linha e
selecione a peça do catálogo. **+ Peça / Editar peça** abrem o modal de cadastro
(código, descrição e fornecedor). Na linha, esses dados ficam cinza e somente
para consulta; quantidade e classificação são editáveis e pertencem ao
atendimento. Não há busca por botão nem gravação direta do cadastro na linha.
Remover peça retira somente a linha; Excluir desativa o cadastro mediante
confirmação, preservando o histórico. Salvar/Finalizar grava as linhas do atendimento.

O atendimento usa seções expansíveis: somente uma seção principal fica aberta.
Equipe/profissionais, motivos/serviços, peças e dias também abrem individualmente.
Clicar fora, no título da página ou em áreas vazias preserva o último bloco em uso.
Entrar em outra seção troca a seção ativa; somente fechar o cabeçalho manualmente
pode deixar todas fechadas. Ao entrar em uma seção com itens pendentes, o caminho
até o item a preencher é aberto automaticamente (por exemplo Equipe → Profissional 1).
Essa orientação acontece ao entrar, sem trocar o foco a cada caractere digitado.
Fechar não apaga o preenchimento.
Os indicadores atualizam durante a digitação: ○ Vazio, ◐ Pendente, ! Inválido,
✓ Completo. Campos opcionais não se tornam obrigatórios; peças e cronograma
podem ficar vazios. Os indicadores não substituem a validação ao salvar/finalizar.
Tab avança e abre o próximo bloco. Enter avança nos campos simples; em textos
longos, Enter mantém a quebra de linha e Ctrl+Enter avança. Botões e seletores
preservam seu comportamento nativo. Salvar/Finalizar continua necessário.

Horários usam hora/minuto segmentados: clicar em qualquer parte do campo abre
o seletor e clicar no segmento seleciona seu texto. Dois dígitos na hora avançam
para minutos. ↑/↓ ajustam valores, Tab avança e Esc fecha; também é possível colar
HH:mm. O seletor oferece todas as horas e minutos, sem limitar a intervalos de cinco.

Cada dia permite observações e selecionar **quem trabalhou neste dia** entre os
profissionais de Identificação. Somente os selecionados têm seus horários e KM
contabilizados. Abra o profissional para preencher sua programação. “Mesmo horário”
acompanha horários/pausas de outro participante; desmarque para editar individualmente
(restaura os horários próprios anteriores, ou copia os compartilhados). “Mesmo carro”
evita duplicar KM, sem obrigar horários iguais. É possível o primeiro técnico estar
ausente e somente outro profissional trabalhar. Resumo e PDF identificam os presentes.

Cada profissional do dia contém grupos expansíveis de ida, trabalho e volta. Use
**+ Ida**, **+ Trabalho** e **+ Volta** para criar quantos períodos precisar.
Cada período tem início, fim e pausa opcional em minutos, descontada somente
dele. Não há mais seletor de destino da pausa. No atendimento interno, somente
Trabalho fica disponível. Totais, resumo e PDF incluem todos os períodos.

- Operacional → Novo atendimento → crie cliente, técnico e equipamento
  pelos botões + do próprio formulário.
- O número identificador fica acima das seções. Em Equipe do atendimento,
  adicione quantos profissionais precisar: o primeiro é sempre Técnico; os
  demais podem ser Técnico ou Auxiliar. Remover uma linha não exclui o cadastro.
  Ao remover o primeiro, o próximo assume a função de Técnico.
- Preencha motivos/serviços/fotos, peças, dias e status finais.
- Salve as duas assinaturas e finalize. Baixe o PDF salvo.
- Volte à gestão; filtre, abra Resumo, edite e confira o documento.
- Inspeções → Nova inspeção → dados/equipamento → checklist A/B/C/D →
  fotos/observações → assinatura → finalizar → PDF.

São os mesmos cadastros e registros usados pelo mobile.
O banco agora é relacional por entidade (contrato 4). Atualize API/web/mobile
juntos. Após reset, recarregue a página e entre com o admin recriado;
o login anterior não existe mais. Inicialização/reset pertencem ao backend.
Este frontend não executa SQL nem recebe credenciais PostgreSQL.
O web requer conexão. O preenchimento offline é do aplicativo mobile.
Fotos e assinaturas precisam terminar de enviar antes da finalização.

    npm run build
    npm test
    npm run preview

O build não requer backend; uso real e PDFs requerem a API.
E2E reproduzível: stg-inspector-api/scripts/e2e.mjs.

## Produção

Dockerfile gera arquivos estáticos servidos por Nginx. O compose de produção
na API publica web e /api sob o mesmo domínio HTTPS via Caddy.
Não colocar senha, chave privada ou configuração PostgreSQL em VITE_*.

A marca textual é BR LIFT. A referência funcional/visual é o STG original,
mas o escopo válido é a proposta revisada: Operacional, Inspeções e sua gestão,
sem financeiro/diretoria/IG.
Documentação de aceite, arquitetura e pendências: pasta local de documentação BR LIFT.
