// ==========================================
// MESSAGE MODULE: Anonymous Guestbook Form
// ==========================================

import { showToast } from './core.js?v=9.3';

let messageFormInitialized = false;
export function initMessageForm() {
    if (messageFormInitialized) return;
    messageFormInitialized = true;
    const anonForm = document.getElementById('anonymous-form');
    if (!anonForm) return;

    const msgInput = document.getElementById('anon-msg');
    const errorEl = document.getElementById('anon-error');
    const setInlineError = (text) => {
        if (!errorEl) return;
        if (text) {
            errorEl.textContent = text;
            errorEl.classList.remove('hidden');
        } else {
            errorEl.textContent = '';
            errorEl.classList.add('hidden');
        }
    };
    if (msgInput) {
        msgInput.addEventListener('input', () => setInlineError(''));
    }

    let isSending = false;
    anonForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isSending) return;
        const name = document.getElementById('anon-name').value.trim() || "Anonymous";
        const msg = msgInput ? msgInput.value.trim() : '';
        const submitBtn = document.getElementById('anon-submit-btn');

        if (!msg) {
            setInlineError('⚠️ Please enter a message before sending!');
            showToast(`⚠️ Please enter a message before sending!`);
            if (msgInput) msgInput.focus();
            return;
        }
        setInlineError('');

        isSending = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending...`;

        fetch('/api/send-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, msg })
        }).then(async res => {
            isSending = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Message`;
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                anonForm.reset();
                setInlineError('');
                const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
showToast(`💌 Thank you <b>${safeName}</b>, your message has been sent successfully!`);
            } else {
                const errText = data.error || 'Failed to send message. Please try again!';
                setInlineError(`❌ ${errText}`);
                showToast(`❌ ${errText}`);
            }
        }).catch(err => {
            isSending = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Message`;
            const errText = 'Connection error! Please try again later.';
            setInlineError(`❌ ${errText}`);
            showToast(`❌ ${errText}`);
        });
    });
}
