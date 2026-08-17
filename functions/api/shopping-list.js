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
    'Access-Control-Allow-Methods': 'GET, PUT, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });

  // Lida com requisições CORS "preflight" (o navegador envia antes do GET/PUT)
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  // GET - retorna a lista salva
  if (request.method === 'GET') {
    try {
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

  // PUT - salva a lista recebida no KV
  if (request.method === 'PUT') {
    try {
      const body = await request.text();

      // Valida que o corpo é um JSON válido antes de gravar
      try {
        JSON.parse(body);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Corpo da requisição não é um JSON válido.' }),
          {
            status: 400,
            headers,
          }
        );
      }

      await env.SHOPPING_LIST_KV.put('shopping_list', body);

      return new Response(JSON.stringify({ success: true }), {
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

  // Qualquer outro método não é permitido
  return new Response(JSON.stringify({ error: 'Método não permitido' }), {
    status: 405,
    headers,
  });
}
