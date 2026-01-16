/**
 * Camoka Unified Dashboard - Vanilla JS Logic
 * Evolution API Entegrasyonu Dahil
 */

// Global State
let channels = [];
let editIndex = null;
let selectedChannelIndex = null;
let currentContacts = [];
let allContacts = []; // Filtreleme için tüm liste
let currentMessages = [];
let activeChatJid = null;
let socket = null;
let socketHeartbeat = null;
let contactNamesMap = {}; // Global isim haritası
let dbHealthStatus = "Bilinmiyor"; // Veritabanı sağlık durumu
let deferredPrompt; // PWA Install prompt

// DOM Elementleri Yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
  loadFromStorage();
  renderSidebar();
  setupEventListeners();
  setupPwaInstall();

  setTimeout(() => {
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) sidebar.classList.remove('invisible');
    logDebug("Uygulama başlatıldı.");
  }, 100);
});

// --- DEBUG YARDIMCILARI ---
function toggleDebug() {
  const panel = document.getElementById('debug-panel');
  panel.classList.toggle('hidden');
}

function clearDebug() {
  document.getElementById('debug-logs').innerHTML = '';
}

function logDebug(msg, data = null) {
  const container = document.getElementById('debug-logs');
  if (!container) return;

  const time = new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.className = 'border-l-2 border-slate-700 pl-2';

  let content = `<span class="text-slate-500">[${time}]</span> <span class="text-white">${msg}</span>`;

  if (data) {
    if (typeof data === 'object') {
      content += `<pre class="mt-1 text-yellow-500/80 overflow-x-auto whitespace-pre-wrap">${JSON.stringify(data, null, 2)}</pre>`;
    } else {
      content += `<div class="mt-1 text-yellow-500/80">${data}</div>`;
    }
  }

  div.innerHTML = content;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  console.log(`[DEBUG] ${msg}`, data || '');
}

// Universal data extractor for varied API versions
function extractArrayData(obj) {
  if (!obj) return [];
  if (Array.isArray(obj)) return obj;

  // Try common keys
  if (obj.records && Array.isArray(obj.records)) return obj.records;
  if (obj.messages && Array.isArray(obj.messages)) return obj.messages;
  if (obj.messages?.records && Array.isArray(obj.messages.records)) return obj.messages.records;
  if (obj.chats && Array.isArray(obj.chats)) return obj.chats;
  if (obj.chats?.records && Array.isArray(obj.chats.records)) return obj.chats.records;
  if (obj.data && Array.isArray(obj.data)) return obj.data;
  if (obj.data?.records && Array.isArray(obj.data.records)) return obj.data.records;
  if (obj.contacts && Array.isArray(obj.contacts)) return obj.contacts;

  // Brute force: find the first array in keys
  for (let key in obj) {
    if (Array.isArray(obj[key])) {
      logDebug(`Diziyi '${key}' anahtarında buldum.`);
      return obj[key];
    }
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      for (let subKey in obj[key]) {
        if (Array.isArray(obj[key][subKey])) {
          logDebug(`Diziyi '${key}.${subKey}' içinde buldum.`);
          return obj[key][subKey];
        }
      }
    }
  }
  return [];
}

// --- VERİ YÖNETİMİ ---

function loadFromStorage() {
  try {
    const saved = localStorage.getItem('camoka_v5');
    if (saved) {
      channels = JSON.parse(saved);
    }
  } catch (e) {
    console.error("Kayıtlı veri okunamadı:", e);
    channels = [];
  }
}

function saveToStorage() {
  localStorage.setItem('camoka_v5', JSON.stringify(channels));
  renderSidebar();
  renderSettingsList();
}

// --- API İŞLEMLERİ (YENİ) ---

function getApiHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'apikey': apiKey
  };
}

async function fetchContacts(channelIndex) {
  const ch = channels[channelIndex];
  if (!ch) return;

  const container = document.getElementById('contact-list');
  container.innerHTML = '<div class="text-center text-slate-500 py-4"><i class="fa-solid fa-circle-notch fa-spin"></i> Kişiler yükleniyor...</div>';

  const platform = ch.platform || ch.type; // Eski yedek uyumu için type ekledik
  if (platform === 'whatsapp') {
    await fetchWhatsAppContacts(ch, container);
  } else if (platform === 'instagram') {
    await fetchInstagramContacts(ch, container);
  }
}

async function fetchWhatsAppContacts(ch, container) {
  const baseUrl = ch.apiUrl.replace(/\/$/, "");

  // 1. Önce isimleri güncelle (boşsa veya gerekiyorsa)
  if (Object.keys(contactNamesMap).length === 0) {
    try {
      const contactsRes = await fetch(`${baseUrl}/chat/findContacts/${ch.instanceName}`, {
        method: 'POST',
        headers: getApiHeaders(ch.apiKey),
        body: JSON.stringify({ "where": {} })
      });
      if (contactsRes.ok) {
        const data = await contactsRes.json();
        const contactsArr = extractArrayData(data);
        contactsArr.forEach(c => {
          const jid = c.remoteJid || c.id;
          if (jid) {
            contactNamesMap[jid] = c.pushName || c.name || c.notify || c.verifiedName;
          }
        });
        logDebug(`${Object.keys(contactNamesMap).length} kişi ismi haritalandı.`);
      }
    } catch (e) {
      logDebug("İsim haritası oluşturulamadı (opsiyonel).", e);
    }
  }

  // 2. Şimdi sıralı sohbetleri çek
  const endpoint = `${baseUrl}/chat/findChats/${ch.instanceName}`;
  logDebug(`Sohbetler isteniyor (findChats)...`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getApiHeaders(ch.apiKey),
      body: JSON.stringify({})
    });

    if (!response.ok) {
      logDebug(`Sohbet API Hatası: ${response.status}`, await response.text());
      throw new Error('API Hatası: ' + response.status);
    }

    const data = await response.json();
    logDebug(`Sohbetler alındı [HAM]`, data);

    let rawChats = extractArrayData(data);
    logDebug(`Ham sohbet sayısı: ${rawChats.length}`);

    allContacts = rawChats.filter(c => {
      const jid = c.remoteJid || c.id || c.jid || '';
      return jid && !jid.includes('@lid') && !jid.includes('@broadcast') && !jid.includes('status@broadcast');
    }).map(c => {
      const jid = c.remoteJid || c.id || c.jid;

      // Zamanı standardize et
      let ts = c.conversationTimestamp || c.messageTimestamp || (c.lastMessage?.messageTimestamp) || 0;
      if (!ts && c.updatedAt) ts = new Date(c.updatedAt).getTime() / 1000;

      // İsim iyileştirme (Map'ten veya objeden)
      let name = contactNamesMap[jid] || c.pushName || c.name || c.notify || c.verifiedName;
      if (!name && c.lastMessage && !c.lastMessage.key.fromMe && c.lastMessage.pushName && c.lastMessage.pushName !== 'Você') {
        name = c.lastMessage.pushName;
      }

      return {
        ...c,
        id: jid,
        displayName: name,
        messageTimestamp: ts
      };
    });

    currentContacts = [...allContacts];
    renderContactList();

  } catch (error) {
    console.error('Kişi çekme hatası:', error);
    container.innerHTML = `<div class="text-red-400 text-sm text-center p-4">Bağlantı hatası: ${error.message}</div>`;
  }
}

async function fetchInstagramContacts(ch, container) {
  logDebug(`Instagram kişileri isteniyor...`, { pageId: ch.pageId });

  try {
    const endpoint = `${ch.apiUrl}/${ch.pageId}/conversations?platform=instagram&access_token=${ch.accessToken}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      const err = await response.json();
      logDebug(`Instagram API Hatası:`, err);
      throw new Error(err.error?.message || response.status);
    }

    const data = await response.json();
    logDebug(`Instagram konuşmaları alındı:`, data);

    // Instagram conversations data formatı: { data: [ { id: "...", updated_time: "..." } ] }
    allContacts = (data.data || []).map(conv => ({
      id: conv.id,
      name: `Konuşma ${conv.id.substring(0, 8)}...`,
      displayName: `Konuşma ${conv.id.substring(0, 8)}...`,
      updated_time: conv.updated_time
    }));

    currentContacts = [...allContacts];
    renderContactList();

  } catch (error) {
    console.error('IG Kişi çekme hatası:', error);
    container.innerHTML = `<div class="text-red-400 text-sm text-center p-4">
        <i class="fa-solid fa-triangle-exclamation mb-2 text-2xl"></i><br>
        Instagram bağlantı hatası.<br>
        <span class="text-xs text-slate-500">${error.message}</span>
    </div>`;
  }
}

async function fetchMessages(remoteJid) {
  const ch = channels[selectedChannelIndex];
  if (!ch) return;

  const container = document.getElementById('messages-container');
  // Yükleniyor animasyonu ekle
  container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
          <i class="fa-solid fa-circle-notch fa-spin text-2xl text-primary"></i>
          <span>Mesajlar yükleniyor...</span>
      </div>
  `;

  if (ch.platform === 'whatsapp') {
    await fetchWhatsAppMessages(ch, remoteJid, container);
  } else if (ch.platform === 'instagram') {
    await fetchInstagramMessages(ch, remoteJid, container);
  }
}

async function fetchWhatsAppMessages(ch, remoteJid, container) {
  const baseUrl = ch.apiUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/chat/findMessages/${ch.instanceName}`;

  logDebug(`Mesajlar isteniyor: ${remoteJid}`, { endpoint });

  try {
    const bodyPayload = {
      "where": {
        "key": {
          "remoteJid": remoteJid
        }
      },
      "options": {
        "limit": 20,
        "sort": "DESC" // Sondan başa
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getApiHeaders(ch.apiKey),
      body: JSON.stringify(bodyPayload)
    });

    if (!response.ok) {
      const errText = await response.text();
      logDebug(`Mesaj API Hatası: ${response.status}`, errText);
      throw new Error('API Hatası: ' + response.status);
    }

    const data = await response.json();
    logDebug("Mesaj verisi alındı [HAM]", data);

    const messages = extractArrayData(data);
    // Reverse messages to show oldest at top, newest at bottom
    currentMessages = messages.map(m => {
      let msgBody = m;
      if (m.message) {
        if (m.message.message) msgBody = m.message.message;
        else msgBody = m.message;
      }

      return {
        ...m,
        fromMe: !!(m.key?.fromMe),
        message: msgBody,
        messageTimestamp: m.messageTimestamp || m.message?.messageTimestamp || (m.updatedAt ? new Date(m.updatedAt).getTime() / 1000 : 0)
      };
    }).reverse(); // API DESC döner, biz ASC gösterelim

    logDebug(`İşlenen mesaj sayısı: ${currentMessages.length}`);

    if (currentMessages.length > 0) {
      logDebug("Örnek Mesaj (Detaylı):", {
        raw: currentMessages[0],
        body: currentMessages[0].message
      });
    }

    renderMessages();
    scrollToBottom();
  } catch (error) {
    console.error('Mesaj çekme hatası:', error);
    logDebug(`KRİTİK HATA: Mesajlar yüklenemedi: ${error.message}`);
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-red-400 gap-2">
            <i class="fa-solid fa-circle-exclamation text-2xl"></i>
            <span>Mesajlar yüklenemedi</span>
            <span class="text-xs text-slate-500 max-w-xs text-center">${error.message}</span>
        </div>`;
  }
}

async function fetchInstagramMessages(ch, conversationId, container) {
  logDebug(`Instagram mesajları isteniyor: ${conversationId}`);

  try {
    const endpoint = `${ch.apiUrl}/${conversationId}/messages?fields=text,created_time,from&limit=20&access_token=${ch.accessToken}`;
    const response = await fetch(endpoint);

    if (!response.ok) {
      const err = await response.json();
      logDebug(`IG Mesaj Hatası:`, err);
      throw new Error(err.error?.message || response.status);
    }

    const data = await response.json();
    logDebug(`IG Mesajları alındı:`, data.data?.length);

    currentMessages = (data.data || []).map(m => ({
      key: { fromMe: m.from.id === ch.pageId, id: m.id },
      message: { conversation: m.text },
      messageTimestamp: new Date(m.created_time).getTime() / 1000
    })).reverse(); // Reverse for chronological order

    renderMessages();
    scrollToBottom();
  } catch (error) {
    console.error('IG Mesaj hatası:', error);
    container.innerHTML = `<div class="text-red-400 text-sm text-center p-4">Hata: ${error.message}</div>`;
  }
}

async function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();

  if (!text || !activeChatJid) return;

  const ch = channels[selectedChannelIndex];
  if (!ch) return;

  // UI: Hemen ekle (Optimistic Update)
  logDebug(`Mesaj gönderiliyor: ${text} -> ${activeChatJid}`);

  const tempMsg = {
    key: { fromMe: true, id: 'temp_' + Date.now() },
    message: { conversation: text },
    messageTimestamp: Date.now() / 1000
  };
  currentMessages.push(tempMsg); // Add to end (newest)
  renderMessages();
  scrollToBottom();
  input.value = '';

  if (ch.platform === 'whatsapp') {
    await sendWhatsAppMessage(ch, text);
  } else if (ch.platform === 'instagram') {
    await sendInstagramMessage(ch, text);
  }
}

async function sendWhatsAppMessage(ch, text) {
  const baseUrl = ch.apiUrl.replace(/\/$/, "");
  const endpoint = `${baseUrl}/message/sendText/${ch.instanceName}`;

  const number = activeChatJid; // Use full JID (e.g. 12345@s.whatsapp.net or 12345@g.us)

  logDebug("Mesaj gönderiliyor (WA)...", { to: number, text: text });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: getApiHeaders(ch.apiKey),
      body: JSON.stringify({
        "number": number,
        "text": text
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      logDebug(`WA Hata: ${response.status}`, errText);
      alert(`Mesaj gönderilemedi! Hata: ${response.status}\nDetay: ${errText}`);
    } else {
      logDebug("Mesaj başarıyla gönderildi.");
    }
  } catch (e) {
    logDebug("WA Network/CORS Hatası:", e.message);
    alert("Bağlantı Hatası veya CORS Engeli!\n\nLütfen Evolution API sunucunuzda CORS_ORIGIN=\"*\" ayarının yapıldığından emin olun.");
    console.error('WA Network hatası:', e);
  }
}

async function sendInstagramMessage(ch, text) {
  logDebug("Mesaj gönderiliyor (IG)...", { to: activeChatJid });

  try {
    const endpoint = `${ch.apiUrl}/${ch.pageId}/messages?access_token=${ch.accessToken}`;
    // Not: Instagram send API conversation ID veya recipient ID üzerinden çalışır. 
    // Burada recipient ID'yi mesajlardan veya konuşma detayından çekmek gerekebilir.
    // Basitlik olması adına 'recipient: { id: activeChatJid }' varsayıyoruz (Meta API genelde öyledir).

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: activeChatJid },
        message: { text: text }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      logDebug(`IG Hata:`, err);
      alert("IG Mesajı gönderilemedi: " + (err.error?.message || "Bilinmeyen hata"));
    }
  } catch (e) {
    console.error('IG Network hatası:', e);
  }
}

// --- WEBSOCKET İŞLEMLERİ ---

function connectToSocket(channelIndex) {
  if (socket) {
    logDebug("Eski socket bağlantısı kapatılıyor...");
    socket.disconnect();
    socket = null;
  }

  if (socketHeartbeat) {
    clearInterval(socketHeartbeat);
    socketHeartbeat = null;
  }

  const ch = channels[channelIndex];
  if (!ch || !ch.apiUrl) return;

  const baseUrl = ch.apiUrl.replace(/\/$/, "");
  logDebug(`Socket bağlantısı başlatılıyor: ${baseUrl}`);

  try {
    // Evolution API Socket bağlantısı
    socket = io(baseUrl, {
      query: {
        apiKey: ch.apiKey
      },
      transports: ['websocket', 'polling'], // Websocket'i başa al
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000
    });

    socket.on('connect', () => {
      logDebug("Socket Bağlandı! ID:", socket.id);

      // Global eventleri dinle
      socket.emit('join', ch.instanceName); // Bazı versiyonlarda gerekebilir
    });

    socket.on('disconnect', (reason) => {
      logDebug("Socket Bağlantısı Koptu:", reason);
    });

    socket.on('connect_error', (error) => {
      logDebug("Socket Bağlantı Hatası:", error.message);
    });

    // Mesaj Olaylarını Dinle (Evolution API v1/v2 uyumlu)
    socket.on('messages.upsert', (data) => handleSocketMessage(data));
    socket.on('messages.update', (data) => handleSocketMessage(data));

    // Alternatif event isimleri (versiyon farkı varsa)
    socket.on('message', (data) => handleSocketMessage(data));

    // Heartbeat
    socketHeartbeat = setInterval(() => {
      if (socket && socket.connected) {
        // logDebug("Socket aktif...");
      }
    }, 30000);

  } catch (err) {
    logDebug("Socket Başlatma Hatası:", err.message);
  }
}

function handleSocketMessage(data) {
  // logDebug("Socket Verisi Geldi:", data);

  // Veriyi ayrıştır
  let message = null;

  // Yapı: { data: { message: ... } } veya { data: { messages: [...] } }
  if (data.data) {
    if (data.data.message) message = data.data.message;
    else if (data.data.messages && data.data.messages.length > 0) message = data.data.messages[0];
    else message = data.data; // Direkt data olabilir
  } else {
    message = data;
  }

  if (!message || !message.key) return;

  // Şu anki sohbete ait mi?
  const remoteJid = message.key.remoteJid;

  if (remoteJid === activeChatJid) {
    logDebug("⚠️ YENİ MESAJ! Ekrana basılıyor...", remoteJid);

    // Mükerrer kontrolü
    const exists = currentMessages.some(m => m.key.id === message.key.id);
    if (!exists) {
      currentMessages.push(message); // Add to end (newest)
      renderMessages();
      scrollToBottom();
    }
  } else {
    logDebug("Yeni mesaj (farklı sohbet):", remoteJid);
    // İleride burada bildirim rozeti veya liste güncellemesi yapılabilir
  }
}

// --- RENDER (GÖRÜNÜM) İŞLEMLERİ ---

function renderSidebar() {
  const container = document.getElementById('sidebar-accounts');
  if (!container) return;
  container.innerHTML = '';

  channels.forEach((ch, index) => {
    const btn = document.createElement('button');
    const isSelected = selectedChannelIndex === index;
    const activeClasses = isSelected ? 'bg-slate-800 border-l-4 border-primary' : 'hover:bg-slate-800/50 border-l-4 border-transparent';

    btn.className = `w-full text-left p-3 rounded-r-xl transition-all flex items-center gap-3 group relative ${activeClasses}`;
    btn.onclick = () => selectChannel(index);

    let iconHtml = ch.platform === 'whatsapp'
      ? '<i class="fa-brands fa-whatsapp text-whatsapp text-xl"></i>'
      : '<i class="fa-brands fa-instagram text-instagram text-xl"></i>';

    btn.innerHTML = `
            <div class="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center shrink-0 shadow-sm">
                ${iconHtml}
            </div>
            <div class="sidebar-text hidden overflow-hidden">
                <p class="text-sm font-medium text-slate-200 truncate">${ch.title}</p>
                <p class="text-xs text-slate-500 truncate">${ch.instanceName || 'Meta'}</p>
            </div>
            ${isSelected ? '<div class="absolute right-2 w-2 h-2 rounded-full bg-primary shadow-lg shadow-primary/50"></div>' : ''}
        `;
    container.appendChild(btn);
  });
  updateSidebarTextVisibility();
}

function renderContactList() {
  const container = document.getElementById('contact-list');
  container.innerHTML = '';

  if (currentContacts.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-500 text-sm mt-5">Kişi bulunamadı.</div>';
    return;
  }

  // Performans: 6000+ kişiyi aynı anda basmak tarayıcıyı dondurur.
  // Şimdilik ilk 100 kişiyi gösterelim.
  const limit = 100;
  const visibleContacts = currentContacts.slice(0, limit);

  // DEBUG: İlk 5 kişinin zaman verisini logla
  if (visibleContacts.length > 0) {
    const timeData = visibleContacts.slice(0, 5).map(c => ({
      name: c.displayName || c.pushName || c.name || c.id,
      ts: c.messageTimestamp,
      lastTs: c.lastMessage?.messageTimestamp,
      upAt: c.updatedAt,
      upTime: c.updated_time
    }));
    logDebug("Sıralama Öncesi Örnek Veri:", timeData);
  }

  // Listeyi son mesaj zamanına göre (yeniden eskiye) sırala. 
  // Zaman yoksa alfabetik sırayı koru.
  visibleContacts.sort((a, b) => {
    const getTs = (obj) => {
      if (obj.messageTimestamp) return obj.messageTimestamp;
      if (obj.lastMessage?.messageTimestamp) return obj.lastMessage.messageTimestamp;
      if (obj.updatedAt) return new Date(obj.updatedAt).getTime() / 1000;
      if (obj.updated_time) return new Date(obj.updated_time).getTime() / 1000;
      return 0;
    };

    const timeA = getTs(a);
    const timeB = getTs(b);

    if (timeB !== timeA) {
      return timeB - timeA;
    }

    const nameA = a.pushName || a.name || a.remoteJid || '';
    const nameB = b.pushName || b.name || b.remoteJid || '';
    return nameA.localeCompare(nameB);
  });

  visibleContacts.forEach(contact => {
    const div = document.createElement('div');
    // JID seçimi: remoteJid varsa onu, yoksa id'yi kullan
    const jid = contact.remoteJid || contact.id;
    const isSelected = activeChatJid === jid;
    const bgClass = isSelected ? 'bg-slate-700/50 border-primary/50' : 'bg-slate-800/40 border-transparent hover:bg-slate-800';

    div.className = `p-3 rounded-xl border ${bgClass} cursor-pointer transition-all flex items-center gap-3 group`;

    // Tıklama olayına debug log ekle
    div.onclick = () => {
      logDebug("Kişi seçildi:", { name: contact.pushName, jid: jid });
      selectContact(contact);
    };

    // Görünen İsim Mantığı:
    let displayName = contact.displayName || contact.name || contact.pushName || contact.notify || contact.verifiedName;

    if (!displayName && contact.remoteJid) {
      displayName = '+' + contact.remoteJid.split('@')[0];
    } else if (!displayName) {
      displayName = jid.split('@')[0];
    }

    div.innerHTML = `
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-white font-bold shrink-0">
                ${displayName.charAt(0).toUpperCase()}
            </div>
            <div class="overflow-hidden flex-1">
                <h4 class="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">${displayName}</h4>
                <p class="text-xs text-slate-500 truncate fa-mono">${jid.split('@')[0]}</p>
            </div>
        `;
    container.appendChild(div);
  });

  if (currentContacts.length > limit) {
    const info = document.createElement('div');
    info.className = 'text-center text-xs text-slate-500 py-2';
    info.innerText = `...ve ${currentContacts.length - limit} kişi daha (Arama yaparak bulabilirsiniz)`;
    container.appendChild(info);
  }
}

function renderMessages() {
  const container = document.getElementById('messages-container');
  container.innerHTML = '';

  if (!currentMessages || currentMessages.length === 0) {
    container.innerHTML = '<div class="text-center text-slate-500 text-sm mt-5">Gösterilecek mesaj yok.</div>';
    return;
  }

  currentMessages.forEach(msg => {
    // Mesaj verisi kontrolü
    if (!msg.key) return;

    const isMe = msg.key.fromMe;
    const div = document.createElement('div');
    div.className = `flex ${isMe ? 'justify-end' : 'justify-start'}`;

    // Mesaj içeriğini bul (Conversation, extendedTextMessage vb.)
    let content = null;
    let type = 'unknown';

    const m = msg.message;
    if (!m) return;

    // Daha geniş kapsamlı metin arama (V2 uyumlu)
    content = m.conversation ||
      m.extendedTextMessage?.text ||
      m.extendedTextMessage?.caption ||
      m.imageMessage?.caption ||
      m.videoMessage?.caption ||
      m.text ||
      (typeof m === 'string' ? m : null);

    // Eğer hala metin bulunamadıysa ama hts içindeyse
    if (!content && m.message) {
      const sub = m.message;
      content = sub.conversation || sub.extendedTextMessage?.text || sub.text;
    }

    if (content) {
      type = 'text';
    } else if (m.imageMessage) {
      content = '📷 Fotoğraf (Görüntüleme yakında)';
      type = 'media';
    } else if (m.videoMessage) {
      content = '🎥 Video (Görüntüleme yakında)';
      type = 'media';
    } else if (m.audioMessage) {
      content = '🎵 Ses (Dinleme yakında)';
      type = 'media';
    } else if (m.protocolMessage) {
      // Geçmiş senkronizasyonu vb. bunları gösterme
      return;
    }

    if (!content) {
      // İçerik parse edilemediyse debug için logla ama UI'ı bozma
      // console.log("Bilinmeyen mesaj tipi:", m);
      content = '<i>Desteklenmeyen mesaj tipi</i>';
    }

    const bubbleClass = isMe
      ? 'bg-primary text-white rounded-br-none'
      : 'bg-slate-800 text-slate-200 rounded-bl-none';

    // Tarih formatlama
    let timeStr = '';
    if (msg.messageTimestamp) {
      const ts = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : msg.messageTimestamp.low;
      if (ts) {
        timeStr = new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    div.innerHTML = `
            <div class="max-w-[70%] ${bubbleClass} px-4 py-2 rounded-2xl shadow-sm text-sm break-words relative group">
                <div class="mb-1">${content}</div>
                <span class="text-[10px] opacity-70 block text-right">
                    ${timeStr}
                </span>
            </div>
        `;
    container.appendChild(div);
  });
}

function renderSettingsList() {
  const container = document.getElementById('settings-account-list');
  if (!container) return;
  container.innerHTML = '';

  channels.forEach((ch, index) => {
    const item = document.createElement('div');
    item.className = 'bg-slate-900 border border-slate-700 rounded-xl p-3 flex justify-between items-center group hover:border-slate-600 transition-colors';

    let iconClass = ch.platform === 'whatsapp' ? 'fa-whatsapp text-whatsapp' : 'fa-instagram text-instagram';

    item.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center">
                    <i class="fa-brands ${iconClass} text-xl"></i>
                </div>
                <div>
                    <h4 class="font-medium text-white">${ch.title}</h4>
                    <p class="text-xs text-slate-500 truncate max-w-[200px]">${ch.platform} &bull; ${ch.instanceName || (ch.pageId || 'Ayarlanmamış')}</p>
                </div>
            </div>
            <div class="flex gap-2 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                <button onclick="window.populateFormForEdit(${index})" class="p-2 hover:bg-slate-800 rounded-lg text-blue-400 transition-colors"><i class="fa-solid fa-pen"></i></button>
                <button onclick="window.deleteAccount(${index})" class="p-2 hover:bg-slate-800 rounded-lg text-red-500 transition-colors"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
    container.appendChild(item);
  });
}

function updateSidebarTextVisibility() {
  const sidebar = document.getElementById('main-sidebar');
  const texts = document.querySelectorAll('.sidebar-text');
  const logoText = document.getElementById('sidebar-logo-text');
  const isExpanded = sidebar.classList.contains('w-64');

  if (isExpanded) {
    texts.forEach(el => el.classList.remove('hidden'));
    if (logoText) {
      logoText.classList.remove('hidden');
      setTimeout(() => logoText.classList.remove('opacity-0'), 50);
    }
  } else {
    texts.forEach(el => el.classList.add('hidden'));
    if (logoText) {
      logoText.classList.add('opacity-0');
      logoText.classList.add('hidden');
    }
  }
}

function scrollToBottom() {
  const container = document.getElementById('messages-container');
  if (container) {
    // Timeout ekleyerek rendering sonrası scroll'un en aşağı gittiğinden emin olalım
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 100);
  }
}


// --- ETKİLEŞİM İŞLEMLERİ ---

function selectChannel(index) {
  selectedChannelIndex = index;
  activeChatJid = null; // Kanal değişince aktif sohbeti sıfırla
  contactNamesMap = {}; // Kanal değişince isim haritasını sıfırla

  renderSidebar();

  const ch = channels[index];
  const headerTitle = document.getElementById('current-flow-title');
  if (headerTitle) headerTitle.textContent = ch.title;

  // Arayüzü Sıfırla
  document.getElementById('messages-container').classList.add('hidden');
  document.getElementById('input-area').classList.add('hidden');
  document.getElementById('chat-header').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');

  // Kişileri Çek
  fetchContacts(index);

  // Socket Bağlantısını Başlat
  connectToSocket(index);

  // Mobil için: Sidebar'ı kapat
  const sidebar = document.getElementById('main-sidebar');
  if (sidebar) sidebar.classList.add('-translate-x-full');

  // Periyodik sağlık kontrolü (opsiyonel ama debug için ekleyelim)
  checkDatabaseHealth(index);
}

async function checkDatabaseHealth(index) {
  const ch = channels[index];
  const platform = ch.platform || ch.type;
  if (platform !== 'whatsapp') return;

  try {
    const baseUrl = ch.apiUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/instance/connectionState/${ch.instanceName}`, {
      headers: getApiHeaders(ch.apiKey)
    });
    if (response.ok) {
      const data = await response.json();
      dbHealthStatus = data.instance?.state || "Bağlı";
      logDebug(`Veritabanı/Instance Durumu: ${dbHealthStatus}`);
    }
  } catch (e) {
    dbHealthStatus = "Hata";
    logDebug("Sağlık kontrolü başarısız:", e);
  }
}

function selectContact(contact) {
  // JID normalizasyonu
  const jid = contact.remoteJid || contact.id;
  activeChatJid = jid;

  renderContactList(); // Seçili stilini güncelle

  // UI Güncelleme (Sohbet ekranını aç)
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('messages-container').classList.remove('hidden');
  document.getElementById('input-area').classList.remove('hidden');
  document.getElementById('chat-header').classList.remove('hidden');
  document.getElementById('chat-header').style.display = 'flex'; // Flex hatasını önle
  document.getElementById('input-area').style.display = 'flex';

  // Görünen İsim
  let displayName = contact.displayName || contact.name || contact.pushName || contact.notify || contact.verifiedName;
  if (!displayName && contact.remoteJid) {
    displayName = '+' + contact.remoteJid.split('@')[0];
  } else if (!displayName) {
    displayName = jid.split('@')[0];
  }

  document.getElementById('chat-name').textContent = displayName;
  document.getElementById('chat-avatar').textContent = displayName.charAt(0).toUpperCase();

  // Mesajları Getir
  fetchMessages(jid);

  // Mobil için: Sohbeti göster (sağa kaydır)
  const mainChat = document.getElementById('main-chat');
  if (mainChat) {
    mainChat.classList.remove('translate-x-full');
  }
}

window.backToList = function () {
  const mainChat = document.getElementById('main-chat');
  if (mainChat) {
    mainChat.classList.add('translate-x-full');
  }
};

function setupEventListeners() {
  const typeSelect = document.getElementById('new-type');
  if (typeSelect) {
    typeSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      const waFields = document.getElementById('fields-whatsapp');
      const igFields = document.getElementById('fields-instagram');

      if (val === 'whatsapp') {
        waFields.classList.remove('hidden');
        igFields.classList.add('hidden');
      } else {
        waFields.classList.add('hidden');
        igFields.classList.remove('hidden');
      }
    });
  }

  // Arama Event Listener
  const searchInput = document.getElementById('contact-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      if (!term) {
        currentContacts = [...allContacts];
      } else {
        currentContacts = allContacts.filter(c => {
          const name = (c.pushName || c.name || '').toLowerCase();
          const num = (c.id || '').split('@')[0];
          return name.includes(term) || num.includes(term);
        });
      }
      renderContactList();
    });
  }

  // Mesaj Gönderme Event Listeners
  const msgBtn = document.getElementById('btn-send-message');
  const msgInput = document.getElementById('message-input');

  if (msgBtn) msgBtn.addEventListener('click', sendMessage);

  if (msgInput) {
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
}

// --- PWA KURULUM YÖNETİMİ ---
function setupPwaInstall() {
  const installBtn = document.getElementById('pwa-install-btn');
  if (!installBtn) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Tarayıcı varsayılan promptunu engelle
    e.preventDefault();
    // Eventi sakla
    deferredPrompt = e;
    // Butonu göster
    installBtn.classList.remove('hidden');
    logDebug("PWA yükleme butonu aktifleşti.");
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;

    // Prompt'u göster
    deferredPrompt.prompt();

    // Kullanıcı tercihini bekle
    const { outcome } = await deferredPrompt.userChoice;
    logDebug(`Kullanıcı yükleme tercihi: ${outcome}`);

    // Tekrar kullanılamaz, temizle
    deferredPrompt = null;
    // Butonu gizle
    installBtn.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    logDebug('Uygulama başarıyla yüklendi.');
    installBtn.classList.add('hidden');
  });
}

// --- WINDOW FONKSİYONLARI ---

window.toggleSidebar = function () {
  const sidebar = document.getElementById('main-sidebar');
  const icon = document.getElementById('sidebar-toggle-icon');

  if (sidebar.classList.contains('w-20')) {
    sidebar.classList.replace('w-20', 'w-64');
    icon.classList.replace('fa-chevron-right', 'fa-chevron-left');
  } else {
    sidebar.classList.replace('w-64', 'w-20');
    icon.classList.replace('fa-chevron-left', 'fa-chevron-right');
  }
  updateSidebarTextVisibility();
};

window.toggleMobileSidebar = function () {
  const sidebar = document.getElementById('main-sidebar');
  if (sidebar.classList.contains('-translate-x-full')) {
    sidebar.classList.remove('-translate-x-full');
  } else {
    sidebar.classList.add('-translate-x-full');
  }
};

window.openSettings = function () {
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.classList.remove('hidden');
    renderSettingsList();
    window.resetForm();
  }
};

window.closeSettings = function () {
  const modal = document.getElementById('settings-modal');
  if (modal) modal.classList.add('hidden');
};

window.resetForm = function () {
  editIndex = null;
  document.getElementById('form-title').textContent = 'Yeni Hesap Ekle';
  const formIcon = document.getElementById('form-icon');
  if (formIcon) formIcon.className = 'fa-solid fa-plus-circle text-primary';
  document.getElementById('btn-save-account').textContent = 'Hesabı Ekle';
  document.getElementById('btn-cancel-edit').classList.add('hidden');

  document.getElementById('new-name').value = '';
  document.getElementById('new-type').value = 'whatsapp';
  document.getElementById('new-wa-url').value = '';
  document.getElementById('new-wa-key').value = '';
  document.getElementById('new-wa-instance').value = '';

  document.getElementById('new-ig-url').value = '';
  document.getElementById('new-ig-token').value = '';
  document.getElementById('new-ig-pageid').value = '';

  document.getElementById('new-type').dispatchEvent(new Event('change'));
};

window.populateFormForEdit = function (index) {
  const ch = channels[index];
  if (!ch) return;
  editIndex = index;

  document.getElementById('form-title').textContent = 'Hesabı Düzenle';
  const formIcon = document.getElementById('form-icon');
  if (formIcon) formIcon.className = 'fa-solid fa-pen-to-square text-orange-500';

  document.getElementById('btn-save-account').textContent = 'Değişiklikleri Kaydet';
  document.getElementById('btn-cancel-edit').classList.remove('hidden');

  document.getElementById('new-type').value = ch.platform;
  document.getElementById('new-name').value = ch.title;

  if (ch.platform === 'whatsapp') {
    document.getElementById('new-wa-url').value = ch.apiUrl || '';
    document.getElementById('new-wa-key').value = ch.apiKey || '';
    document.getElementById('new-wa-instance').value = ch.instanceName || '';
  } else if (ch.platform === 'instagram') {
    document.getElementById('new-ig-url').value = ch.apiUrl || '';
    document.getElementById('new-ig-token').value = ch.accessToken || '';
    document.getElementById('new-ig-pageid').value = ch.pageId || '';
  }

  document.getElementById('new-type').dispatchEvent(new Event('change'));
};

window.handleSaveAccount = function () {
  const platform = document.getElementById('new-type').value;
  const title = document.getElementById('new-name').value;

  if (!title) {
    alert('Lütfen bir hesap adı giriniz.');
    return;
  }

  const newAccount = {
    platform,
    title,
    apiUrl: '', apiKey: '', instanceName: '', accessToken: '', pageId: ''
  };

  if (platform === 'whatsapp') {
    newAccount.apiUrl = document.getElementById('new-wa-url').value;
    newAccount.apiKey = document.getElementById('new-wa-key').value;
    newAccount.instanceName = document.getElementById('new-wa-instance').value;
  } else if (platform === 'instagram') {
    newAccount.apiUrl = document.getElementById('new-ig-url').value || 'https://graph.facebook.com/v18.0';
    newAccount.accessToken = document.getElementById('new-ig-token').value;
    newAccount.pageId = document.getElementById('new-ig-pageid').value;
  }

  if (editIndex !== null) {
    channels[editIndex] = newAccount;
  } else {
    channels.push(newAccount);
  }

  saveToStorage();
  window.resetForm();
};

window.deleteAccount = function (index) {
  if (confirm('Bu hesabı silmek istediğinize emin misiniz?')) {
    channels.splice(index, 1);
    if (selectedChannelIndex === index) {
      selectedChannelIndex = null;
      document.getElementById('contact-list').innerHTML = '';
      document.getElementById('messages-container').innerHTML = '';
      document.getElementById('empty-state').classList.remove('hidden');
      document.getElementById('chat-header').classList.add('hidden');
    }
    saveToStorage();
  }
};
