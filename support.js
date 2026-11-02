const shareButton = document.getElementById('share');
shareButton.addEventListener('click', async () => {
  const status = document.getElementById('share-status');
  if (location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname)) {
    status.textContent = '公開後に、このページのURLをシェアできます。';
    return;
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: document.title, text: '沖縄から挑む結マール５を、一緒に応援しよう。', url: location.href });
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(location.href);
      status.textContent = 'ページのURLをコピーしました。';
    } else {
      status.textContent = 'ブラウザのアドレス欄からURLをコピーしてシェアしてください。';
    }
  } catch (error) {
    if (error.name !== 'AbortError') status.textContent = 'ブラウザのアドレス欄からURLをコピーしてシェアしてください。';
  }
});
document.getElementById('back-top').addEventListener('click', (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
