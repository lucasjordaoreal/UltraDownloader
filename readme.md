# Notas de Lançamento 🚀

Esta atualização traz uma reformulação significativa da experiência visual, do desempenho do aplicativo e da lógica principal de download. Nos concentramos na responsividade instantânea, em um design fluido completamente modernizado e em melhorias no fluxo de trabalho de nível profissional.

### ✨ Reformulação Visual e de Design
* **Estética Arredondada Unificada**: Todos os elementos da interface do usuário — de botões e campos de entrada a cantos modais — agora seguem uma **geometria arredondada de 22px** consistente, eliminando bordas afiadas para uma sensação mais suave e premium.

* **Integração de Cabeçalho Aprimorada**: O cabeçalho do aplicativo agora combina perfeitamente com a curvatura da interface principal, removendo os cantos pontiagudos antigos.

* **Animações Fluidas de 120fps**: Todas as transições e interações (efeitos de foco, mudanças de layout, troca de modo) agora usam **animações de mola baseadas em física** (Rigidez: 400, Amortecimento: 28), otimizadas para telas de alta taxa de atualização com zero oscilação.

### ⚡ Otimizações de Desempenho e Experiência do Usuário
* **Inicialização Instantânea**: A lógica agressiva de pré-renderização e inicialização agora permite que o aplicativo seja interativo em **menos de 50 ms**.

* **Colagem Automática Inteligente**: O aplicativo agora detecta e cola URLs da sua área de transferência de forma inteligente, imediatamente após a abertura, focando automaticamente o campo de entrada para que você possa clicar em baixar instantaneamente.

* **Estado Persistente do Usuário**: Suas preferências (Resolução, Formato, Configurações de Compressão, Visualização Ativa) agora são armazenadas em cache e restauradas instantaneamente a cada inicialização.

* **"Melhor" por Padrão**: A qualidade de download padrão agora está permanentemente definida como "**Melhor**", garantindo fidelidade máxima sem ajustes manuais.

### 🛠 Atualizações Principais de Engenharia
* **Imposição Rigorosa de MP4**: O mecanismo de download foi reestruturado para impor rigorosamente a saída de **Vídeo H.264 + Áudio AAC**. Isso garante a compatibilidade com MP4 em todos os dispositivos e editores, eliminando completamente os formatos VP9/AV1/WebM do fluxo de trabalho.
* **Inicialização otimizada**: Removemos atrasos artificiais de inicialização e tarefas assíncronas de bloqueio para um estado "pronto para uso" ágil.

### ⌨️ Novos atalhos globais
Aumente sua produtividade com controles de teclado em todo o sistema:
* **`Ctrl + V`**: Colar URL e Focar de forma inteligente
* **`Ctrl + D`**: Iniciar download
* **`Ctrl + K`**: Focar no campo de entrada
* **`Ctrl + L`**: Limpar entrada
* **`Ctrl + 1`**: Alternar para o Downloader
* **`Ctrl + 2`**: Alternar para o Compressor
* **`Ctrl + Tab`**: Alternar visualizações