const CACHE_NAME = 'meu-mercado-cache-v4';

// Host do Worker que serve a API de dados (lista de compras) e a API de
// itens/autocomplete (Lista de Itens). Requisições para este host NUNCA
// devem ser respondidas pelo cache do Service Worker: o app já tem sua
// própria lógica de cache/staleness via localStorage (itensList_cache,
// itensList_saved_at). Deixar o SW cachear essas respostas (o que
// acontecia antes, pois elas caíam na Estratégia 3 "cache-first" por não
// baterem com nenhum path de /api/*) era a causa raiz da invalidação de
// cache quebrada entre dispositivos: uma vez cacheada pelo SW, a resposta
// antiga era servida para sempre, mesmo com o dispositivo online e mesmo
// depois de o servidor já ter a versão atualizada.
const DATA_API_HOSTS = ['meumercado-api.qiitomnhhh.workers.dev'];
const urlsToCache = [
  '/', 
  'index.html',
  'itens.html',
  '01.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/webfonts/fa-solid-900.woff2', 
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.14.0/Sortable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js'
];

// Evento de Instalação: Abre o cache e armazena os arquivos principais.
self.addEventListener('install', event => {
  // CORRIGIDO: sem isso, um SW novo instalado fica em estado "waiting" até
  // que TODAS as abas/instâncias do app sejam fechadas. Em dispositivos que
  // nunca fecham a aba de verdade (ex.: apps sempre em segundo plano em
  // smartwatch), o SW antigo nunca é substituído e o dispositivo continua
  // preso na lógica de cache antiga (quebrada) para sempre. skipWaiting()
  // faz o novo SW assumir assim que instalado.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache aberto. Adicionando ativos estáticos.');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('[SW] Falha ao adicionar URLs ao cache:', err);
      })
  );
});

// Evento de Fetch: Intercepta as requisições.
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  const path = requestUrl.pathname;

  // --- ESTRATÉGIA 0: NETWORK-FIRST PARA O APP SHELL (HTML) ---
  // CORRIGIDO (causa raiz do bug "itens somem offline"): antes, index.html/
  // itens.html caíam na Estratégia 3 (cache-first) junto com os outros
  // ativos estáticos. Como o CACHE_NAME só muda quando alguém lembra de
  // incrementá-lo manualmente, um SW já instalado ficava servindo para
  // sempre a MESMA versão antiga do index.html (e do JS embutido nele) —
  // mesmo com o dispositivo online e mesmo depois de o HTML já ter sido
  // corrigido no servidor. Ou seja: o app parecia ter "perdido" a lógica de
  // fallback offline (localStorage) porque, na prática, o usuário nunca
  // chegava a rodar o JS novo que contém essa lógica.
  // Agora: sempre que houver rede, busca a versão mais recente do HTML e
  // atualiza o cache. Só usa o cache (versão antiga) se a rede falhar,
  // que é exatamente o caso de estar offline.
  if (event.request.mode === 'navigate' ||
      path === '/' ||
      path.endsWith('index.html') ||
      path.endsWith('itens.html')) {
    event.respondWith(
      fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      }).catch(() => {
        console.log('[SW] App shell offline. Servindo versão em cache.');
        return caches.match(event.request).then(cached => cached || caches.match('index.html'));
      })
    );
    return;
  }

  // --- ESTRATÉGIA 1: NETWORK-ONLY ---
  // Para a API de dados do USUÁRIO (login, logout, lista pessoal), o Worker
  // de dados (lista de compras + lista de itens/autocomplete) e o iFrame.
  // ATUALIZADO: Tornamos a verificação de '/api/list' exata (path ===) para evitar conflito.
  // CORRIGIDO: Requisições ao Worker de dados (DATA_API_HOSTS) agora são
  // sempre NETWORK-ONLY, nunca cache-first. Antes, como essas requisições
  // são feitas para a raiz do host (path "/"), elas não batiam com nenhuma
  // regra específica e caíam na Estratégia 3 (cache-first), fazendo o SW
  // "congelar" a primeira resposta buscada e nunca mais revalidar — mesmo
  // online — o que causava dados desatualizados entre dispositivos.
  if (path === '/api/list' || 
      path === '/api/login' || 
      path === '/api/register' || 
      path === '/api/logout' || 
      DATA_API_HOSTS.includes(requestUrl.hostname) ||
      requestUrl.hostname.includes('streamlit.app')) {
        
    return event.respondWith(
      // CORRIGIDO: cache: 'no-store' evita que o próprio cache HTTP nativo
      // do navegador (independente do Service Worker) reutilize uma
      // resposta antiga para esse GET.
      fetch(event.request, { cache: 'no-store' }).catch(error => {
        console.log(`[SW] API/iFrame falhou (Offline). Deixando o código JS usar o localStorage.`, error);
        // Retorna uma resposta de erro padrão para a rede
        return new Response(JSON.stringify({ error: 'Offline' }), {
          status: 503,
          statusText: 'Service Unavailable (Offline)',
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
  }

  // --- ESTRATÉGIA 2: STALE-WHILE-REVALIDATE (SWR) ---
  // Para a lista de ITENS (autocomplete), que agora vem da API.
  // Esta é a mudança principal para o autocomplete offline.
  if (path === '/api/shopping-list') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          
          // Tenta a rede, mesmo que haja resposta no cache.
          const fetchPromise = fetch(event.request).then(networkResponse => {
            if (networkResponse.ok) {
              // Atualiza o cache com a nova versão
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(error => {
            console.log("[SW] /api/shopping-list: Falha na rede durante o revalidate.", error);
          });
          
          // Se tiver cache, retorna o cache (STALE) e deixa a rede revalidar.
          // Se não tiver cache (primeira visita offline), aguarda a rede (fetchPromise).
          return response || fetchPromise;
        });
      })
    );
    return; // Para o fluxo de fetch aqui
  }

  // --- ESTRATÉGIA 3: CACHE-FIRST ---
  // Para todos os outros ativos (HTML, CSS, JS, Fonts), usa o cache primeiro.
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response; // Retorna do cache se encontrado.
        }
        
        // Se não estiver no cache, busca na rede e armazena.
        return fetch(event.request).then(
          (response) => {
            if(!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
              return response;
            }

            var responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// Evento de Ativação: Limpa caches antigos
self.addEventListener('activate', event => {
  console.log('[SW] Ativando novo cache e limpando versões antigas.');
  var cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheWhitelist.indexOf(cacheName) === -1) {
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // CORRIGIDO: assume o controle de todas as abas/páginas já abertas
      // imediatamente, sem esperar um novo reload. Junto com skipWaiting(),
      // isso garante que o dispositivo passe a rodar o SW novo (com a
      // estratégia network-only para o Worker de dados) assim que possível.
      self.clients.claim()
    ])
  );
});
