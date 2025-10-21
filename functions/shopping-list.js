/**
 * Este é um Cloudflare Pages Function.
 * Ele será executado automaticamente quando a URL /shopping-list for acessada.
 * O 'context' contém o acesso ao KV.
 */

export async function onRequest(context) {
  // O 'env' com suas variáveis (incluindo o KV) está dentro de 'context.env'
  const { request, env } = context;

  // Cabeçalhos de resposta
  const headers = new Headers({
    'Content-Type': 'application/json;charset=UTF-8',
    'Access-Control-Allow-Origin': '*', // Permite que qualquer domínio acesse
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  });

  // Lida com requisições CORS "preflight" (o navegador envia antes do GET)
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  // Apenas processa requisições GET
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers,
    });
  }

  try {
    // 1. Acessa o KV usando o nome da variável que você configurou: 'SHOPPING_LIST_KV'
    // 2. Busca a chave 'shopping_list'
    const shoppingListData = await env.SHOPPING_LIST_KV.get('shopping_list', { type: 'json' });

    if (shoppingListData === null) {
      return new Response(
        JSON.stringify({ error: "A chave 'shopping_list' não foi encontrada no KV." }),
        {
          status: 404,
          headers,
        }
      );
    }

    // 3. Retorna os dados encontrados
    return new Response(JSON.stringify(shoppingListData), {
      status: 200,
      headers,
    });

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: 'Erro interno no servidor da Função.' }),
      {
        status: 500,
        headers,
      }
    );
  }
}
