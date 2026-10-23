// ==========================================
// MESSAGE MODULE: Anonymous Guestbook Form
// ==========================================

import { showToast } from './core.js';

let messageFormInitialized = false;
export function initMessageForm() {
    if (messageFormInitialized) return;
    messageFormInitialized = true;
    const anonForm = document.getElementById('anonymous-form');
    if (!anonForm) return;

    let isSending = false;
    anonForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (isSending) return;
        const name = document.getElementById('anon-name').value.trim() || "Anonymous";
        const msg = document.getElementById('anon-msg').value.trim();
        const submitBtn = document.getElementById('anon-submit-btn');

        if (!msg) {
            showToast(`⚠️ Please enter a message before sending!`);
            return;
        }

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
                const safeName = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
showToast(`💌 Thank you <b>${safeName}</b>, your message has been sent successfully!`);
            } else {
                showToast(`❌ ${data.error || 'Failed to send message. Please try again!'}`);
            }
        }).catch(err => {
            isSending = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Message`;
            showToast(`❌ Connection error! Please try again later.`);
        });
    });
}
