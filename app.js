// Configuration - REPLACE WITH YOUR SUPABASE CREDENTIALS
const SUPABASE_URL = 'https://oqpicdtblhowcxmyvhgh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xcGljZHRibGhvd2N4bXl2aGdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY4NTA5MzgsImV4cCI6MjA4MjQyNjkzOH0.iCO86XolzutT9vnn4R905Oi3acVWhOxWyGdIgCU1cKc';

// Simple Supabase client
class SupabaseClient {
    constructor(url, key) {
        this.url = url;
        this.key = key;
        this.headers = {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
        };
    }

    async query(table, method = 'GET', data = null) {
        const url = `${this.url}/rest/v1/${table}`;
        const options = {
            method,
            headers: this.headers
        };

        if (data && (method === 'POST' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Supabase query error:', error);
            throw error;
        }
    }

    async insert(table, data) {
        return this.query(table, 'POST', data);
    }

    async select(table, filters = '') {
        const url = `${this.url}/rest/v1/${table}?${filters}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: this.headers
        });
        return response.json();
    }
}

// Initialize Supabase (will work offline too)
let supabase;
try {
    if (SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
        supabase = new SupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
} catch (error) {
    console.log('Supabase not configured yet');
}

// State Management
let entries = [];
let currentTab = 'form';
let deferredPrompt;
let isOnline = navigator.onLine;

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.log('Service Worker registration failed'));
    });
}

// PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('install-prompt').classList.add('show');
});

async function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response: ${outcome}`);
        deferredPrompt = null;
        document.getElementById('install-prompt').classList.remove('show');
    }
}

// Online/Offline Detection
window.addEventListener('online', () => {
    isOnline = true;
    document.getElementById('offline-indicator').classList.remove('show');
    syncOfflineData();
});

window.addEventListener('offline', () => {
    isOnline = false;
    document.getElementById('offline-indicator').classList.add('show');
});

// Initialize
async function init() {
    await loadEntries();
    setupEventListeners();
    setDefaultMealTime();
    setGreeting();
    checkAndRequestNotifications();
    scheduleReminders();
    
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.getElementById('install-prompt').style.display = 'none';
    }
}

// Set personalized greeting based on time of day
function setGreeting() {
    const hour = new Date().getHours();
    const greetings = {
        morning: [
            'בוקר טוב זוהרי 🌅',
            'בוקר טוב יפה שלי ☀️',
            'בוקר טוב מתוקה 💛',
            'בוקר מקסים נסיכה 🌸'
        ],
        noon: [
            'צהריים טובים מהממת ✨',
            'צהריים טובים יפה 🌺',
            'צהריים נעימים מתוקה 💕',
            'צהריים מקסימים נסיכה 🌼'
        ],
        evening: [
            'ערב טוב יקרה 🌙',
            'ערב נעים מתוקה ⭐',
            'ערב טוב נסיכה 💫',
            'ערב מקסים יפה 🌟'
        ],
        night: [
            'לילה טוב מתוקה 🌙',
            'לילה נעים נסיכה 💤',
            'לילה טוב יפה שלי ✨',
            'חלומות מתוקים 💜'
        ]
    };
    
    let timeOfDay, emoji;
    if (hour >= 5 && hour < 12) {
        timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 17) {
        timeOfDay = 'noon';
    } else if (hour >= 17 && hour < 22) {
        timeOfDay = 'evening';
    } else {
        timeOfDay = 'night';
    }
    
    // Random greeting from the appropriate time
    const options = greetings[timeOfDay];
    const greeting = options[Math.floor(Math.random() * options.length)];
    
    document.getElementById('greeting').textContent = greeting;
}

// Request notification permissions
async function checkAndRequestNotifications() {
    if ('Notification' in window && 'serviceWorker' in navigator) {
        const permission = Notification.permission;
        
        if (permission === 'default') {
            // Don't ask immediately, save for later
            localStorage.setItem('notification-prompt-pending', 'true');
        } else if (permission === 'granted') {
            subscribeToReminders();
        }
    }
}

// Subscribe to push notifications
async function subscribeToReminders() {
    try {
        const registration = await navigator.serviceWorker.ready;
        // Enable reminder scheduling
        scheduleReminders();
    } catch (error) {
        console.log('Notification subscription error:', error);
    }
}

// Schedule daily reminders
function scheduleReminders() {
    const notificationsEnabled = localStorage.getItem('reminders-enabled') !== 'false';
    
    if (!notificationsEnabled) return;
    
    // Check last entry time
    const lastEntryTime = entries.length > 0 
        ? new Date(entries[entries.length - 1].timestamp) 
        : null;
    
    if (lastEntryTime) {
        const hoursSinceLastEntry = (Date.now() - lastEntryTime.getTime()) / (1000 * 60 * 60);
        
        // If no entry for 8+ hours during daytime (8am-8pm), show reminder
        const currentHour = new Date().getHours();
        if (hoursSinceLastEntry >= 8 && currentHour >= 8 && currentHour <= 20) {
            showReminderNotification();
        }
    }
}

// Show reminder notification
function showReminderNotification() {
    if (Notification.permission === 'granted') {
        new Notification('מעקב אוכל והרגשה 💙', {
            body: 'זוכרת למלא את הטופס אחרי הארוחה? זה לוקח רק 10 שניות 😊',
            icon: 'icon-192.png',
            badge: 'icon-192.png',
            tag: 'reminder',
            requireInteraction: false
        });
    }
}

// Set default meal time to current time
function setDefaultMealTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('meal-time').value = `${hours}:${minutes}`;
}

// Load entries
async function loadEntries() {
    try {
        // Try Supabase first
        if (supabase && isOnline) {
            const data = await supabase.select('entries', 'order=created_at.desc');
            entries = data.map(row => JSON.parse(row.data));
            
            // Also save to localStorage as backup
            localStorage.setItem('food-tracker-entries', JSON.stringify(entries));
        } else {
            // Fall back to localStorage
            const stored = localStorage.getItem('food-tracker-entries');
            if (stored) {
                entries = JSON.parse(stored);
            }
        }
        console.log(`Loaded ${entries.length} entries`);
    } catch (error) {
        console.error('Error loading entries:', error);
        // Try localStorage as fallback
        const stored = localStorage.getItem('food-tracker-entries');
        if (stored) {
            entries = JSON.parse(stored);
        }
    }
}

// Save entries
async function saveEntries() {
    try {
        // Always save to localStorage first (instant)
        localStorage.setItem('food-tracker-entries', JSON.stringify(entries));
        
        // Then try Supabase if online
        if (supabase && isOnline) {
            const latestEntry = entries[entries.length - 1];
            await supabase.insert('entries', {
                data: JSON.stringify(latestEntry),
                created_at: new Date().toISOString()
            });
        } else if (!isOnline) {
            // Mark for sync later
            const pendingSync = JSON.parse(localStorage.getItem('pending-sync') || '[]');
            pendingSync.push(entries[entries.length - 1]);
            localStorage.setItem('pending-sync', JSON.stringify(pendingSync));
        }
        
        return true;
    } catch (error) {
        console.error('Error saving entries:', error);
        // Data is still in localStorage
        return true; // Don't fail the user experience
    }
}

// Sync offline data when back online
async function syncOfflineData() {
    if (!supabase) return;
    
    try {
        const pendingSync = JSON.parse(localStorage.getItem('pending-sync') || '[]');
        
        for (const entry of pendingSync) {
            await supabase.insert('entries', {
                data: JSON.stringify(entry),
                created_at: new Date().toISOString()
            });
        }
        
        // Clear pending sync
        localStorage.setItem('pending-sync', '[]');
        
        // Reload entries
        await loadEntries();
        if (currentTab === 'dashboard') {
            renderDashboard();
        }
    } catch (error) {
        console.error('Error syncing offline data:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('tracking-form').addEventListener('submit', handleSubmit);
}

// Handle form submission
async function handleSubmit(e) {
    e.preventDefault();
    
    const hasPain = document.querySelector('input[name="pain"]:checked')?.value === 'כן';
    
    // Validate pain section if needed
    if (hasPain) {
        const painTiming = document.getElementById('pain-timing').value;
        const painIntensity = document.querySelector('input[name="pain-intensity"]:checked');
        const painType = document.querySelector('input[name="pain-type"]:checked');
        
        if (!painTiming || !painIntensity || !painType) {
            alert('אנא מלא את כל השדות החובה בסעיף הכאב');
            return;
        }
    }

    // Collect form data
    const entry = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        mealTime: document.getElementById('meal-time').value,
        mealType: document.querySelector('input[name="meal-type"]:checked').value,
        mealDescription: document.getElementById('meal-description').value,
        dairy: document.querySelector('input[name="dairy"]:checked').value,
        gluten: document.querySelector('input[name="gluten"]:checked').value,
        fatty: document.querySelector('input[name="fatty"]:checked').value,
        fastEating: document.querySelector('input[name="fast-eating"]:checked').value,
        pain: hasPain,
        painDetails: hasPain ? {
            timing: parseInt(document.getElementById('pain-timing').value),
            intensity: parseInt(document.querySelector('input[name="pain-intensity"]:checked').value),
            type: document.querySelector('input[name="pain-type"]:checked').value,
            notes: document.getElementById('notes').value
        } : null
    };

    // Add to entries
    entries.push(entry);
    
    // Save
    const saved = await saveEntries();
    
    if (saved) {
        // Show success message
        document.getElementById('tracking-form').style.display = 'none';
        document.getElementById('success-message').style.display = 'block';
        
        // Haptic feedback on mobile
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
    }
}

// Reset form
function resetForm() {
    document.getElementById('tracking-form').reset();
    document.getElementById('tracking-form').style.display = 'block';
    document.getElementById('success-message').style.display = 'none';
    document.getElementById('pain-section').style.display = 'none';
    
    // Clear radio selections visual state
    document.querySelectorAll('.radio-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    
    // Set default time again
    setDefaultMealTime();
}

// Toggle pain section
function togglePainSection(show) {
    const painSection = document.getElementById('pain-section');
    painSection.style.display = show ? 'block' : 'none';
    
    if (!show) {
        // Clear pain section fields
        document.getElementById('pain-timing').value = '';
        document.getElementById('notes').value = '';
        document.querySelectorAll('#pain-section input[type="radio"]').forEach(radio => {
            radio.checked = false;
        });
    }
}

// Tab switching
function switchTab(tab) {
    currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');
    
    // Load appropriate content
    if (tab === 'dashboard') {
        renderDashboard();
    } else if (tab === 'parent') {
        renderParentDashboard();
    }
}

// Render dashboard
function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    
    if (entries.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <div class="no-data-icon">📊</div>
                <h3>עדיין אין נתונים</h3>
                <p>התחילי למלא את הטופס כדי לראות ניתוח</p>
            </div>
        `;
        return;
    }

    // Calculate statistics
    const stats = calculateStatistics();
    
    container.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">סך הארוחות</div>
                <div class="stat-value">${stats.totalMeals}</div>
            </div>
            <div class="stat-card ${stats.painPercentage > 50 ? 'danger' : ''}">
                <div class="stat-label">ארוחות עם כאב</div>
                <div class="stat-value">${stats.painCount}</div>
                <div class="stat-label">(${stats.painPercentage}%)</div>
            </div>
        </div>

        <div class="trigger-analysis">
            <h3>🔍 ניתוח טריגרים</h3>
            ${renderTriggerItem('חלב/גבינה', stats.triggers.dairy)}
            ${renderTriggerItem('קמח/גלוטן', stats.triggers.gluten)}
            ${renderTriggerItem('שומני/מטוגן', stats.triggers.fatty)}
            ${renderTriggerItem('אכילה מהירה', stats.triggers.fastEating)}
        </div>

        <div class="entries-list">
            <h3 style="margin-bottom: 16px;">📝 רשומות אחרונות</h3>
            ${renderEntries()}
        </div>

        <button class="btn btn-secondary" onclick="exportData()" style="margin-top: 16px;">
            📥 ייצוא נתונים
        </button>
    `;
}

// Calculate statistics
function calculateStatistics() {
    const totalMeals = entries.length;
    const painCount = entries.filter(e => e.pain).length;
    const painPercentage = totalMeals > 0 ? Math.round((painCount / totalMeals) * 100) : 0;

    // Calculate trigger rates
    const triggers = {
        dairy: calculateTriggerRate('dairy'),
        gluten: calculateTriggerRate('gluten'),
        fatty: calculateTriggerRate('fatty'),
        fastEating: calculateTriggerRate('fastEating')
    };

    return {
        totalMeals,
        painCount,
        painPercentage,
        triggers
    };
}

// Calculate trigger rate for a specific factor
function calculateTriggerRate(factor) {
    const withFactor = entries.filter(e => e[factor] === 'כן');
    const withFactorAndPain = withFactor.filter(e => e.pain);
    
    if (withFactor.length === 0) return { rate: 0, severity: 'low', count: 0, total: 0 };
    
    const rate = Math.round((withFactorAndPain.length / withFactor.length) * 100);
    let severity = 'low';
    if (rate >= 75) severity = 'high';
    else if (rate >= 60) severity = 'medium';
    
    return {
        rate,
        severity,
        count: withFactorAndPain.length,
        total: withFactor.length
    };
}

// Render trigger item
function renderTriggerItem(name, data) {
    if (data.total === 0) {
        return `
            <div class="trigger-item">
                <span class="trigger-name">${name}</span>
                <span class="trigger-rate" style="background: #f3f4f6; color: #9ca3af;">אין נתונים</span>
            </div>
        `;
    }

    return `
        <div class="trigger-item">
            <span class="trigger-name">${name}</span>
            <span class="trigger-rate ${data.severity}">${data.rate}%</span>
        </div>
    `;
}

// Render entries list
function renderEntries() {
    return entries
        .slice()
        .reverse()
        .slice(0, 10)
        .map(entry => {
            const date = new Date(entry.timestamp);
            const tags = [];
            
            if (entry.dairy === 'כן') tags.push('<span class="tag dairy">חלב</span>');
            if (entry.gluten === 'כן') tags.push('<span class="tag gluten">גלוטן</span>');
            if (entry.fatty === 'כן') tags.push('<span class="tag fatty">שומני</span>');
            if (entry.fastEating === 'כן') tags.push('<span class="tag fast">מהיר</span>');

            return `
                <div class="entry-card ${entry.pain ? 'with-pain' : ''}">
                    <div class="entry-header">
                        <div>
                            <div class="entry-time">${entry.mealTime}</div>
                            <div class="entry-meal">${entry.mealType} • ${date.toLocaleDateString('he-IL')}</div>
                        </div>
                    </div>
                    ${entry.mealDescription ? `
                        <div style="padding: 8px 12px; background: #f9fafb; border-radius: 8px; margin: 8px 0; font-size: 14px; color: #374151;">
                            🍽️ ${entry.mealDescription}
                        </div>
                    ` : ''}
                    ${tags.length > 0 ? `<div class="entry-tags">${tags.join('')}</div>` : ''}
                    ${entry.pain ? `
                        <div class="pain-indicator">
                            <span class="icon">⚠️</span>
                            <div class="pain-details">
                                כאב רמה ${entry.painDetails.intensity}/10 • 
                                ${entry.painDetails.type} • 
                                אחרי ${entry.painDetails.timing} דקות
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');
}

// Export data
function exportData() {
    const dataStr = JSON.stringify(entries, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `food-tracker-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    
    // Haptic feedback
    if ('vibrate' in navigator) {
        navigator.vibrate(50);
    }
}

// Radio selection helper
function selectRadio(element) {
    const parent = element.closest('.radio-group');
    parent.querySelectorAll('.radio-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    element.querySelector('input[type="radio"]').checked = true;
}

// Scale selection helper
function selectScale(element, value) {
    const container = element.closest('.scale-options');
    container.querySelectorAll('.scale-option').forEach(opt => {
        opt.classList.remove('selected');
    });
    element.classList.add('selected');
    element.querySelector('input[type="radio"]').checked = true;
}

// Render Parent Dashboard
function renderParentDashboard() {
    const container = document.getElementById('parent-content');
    
    if (entries.length === 0) {
        container.innerHTML = `
            <div class="no-data">
                <div class="no-data-icon">📊</div>
                <h3>עדיין אין נתונים</h3>
                <p>כשהבת שלך תתחיל למלא, תראה כאן סטטיסטיקות מפורטות</p>
            </div>
        `;
        return;
    }

    const usageStats = calculateUsageStats();
    const timeline = generateTimeline();
    
    container.innerHTML = `
        <div class="parent-dashboard">
            <!-- Usage Statistics -->
            <div class="usage-stats">
                <h3>📊 סטטיסטיקות שימוש</h3>
                <div class="usage-metric">
                    <span class="usage-metric-label">סך הרשומות</span>
                    <span class="usage-metric-value">${usageStats.totalEntries}</span>
                </div>
                <div class="usage-metric">
                    <span class="usage-metric-label">ימים פעילים</span>
                    <span class="usage-metric-value">${usageStats.activeDays}</span>
                </div>
                <div class="usage-metric">
                    <span class="usage-metric-label">ממוצע ביום</span>
                    <span class="usage-metric-value">${usageStats.avgPerDay}</span>
                </div>
                <div class="usage-metric">
                    <span class="usage-metric-label">רשומה אחרונה</span>
                    <span class="usage-metric-value" style="font-size: 14px;">${usageStats.lastEntry}</span>
                </div>
                <div class="usage-metric">
                    <span class="usage-metric-label">שיעור השלמה</span>
                    <span class="usage-metric-value">${usageStats.completionRate}%</span>
                </div>
            </div>

            <!-- Notification Settings -->
            <div class="notification-settings">
                <h3>🔔 הגדרות תזכורות</h3>
                <div class="notification-toggle">
                    <div class="toggle-switch ${usageStats.remindersEnabled ? 'active' : ''}" 
                         onclick="toggleReminders(this)">
                    </div>
                    <div>
                        <strong>תזכורות יומיות</strong>
                        <div style="font-size: 13px; color: #6b7280;">
                            שלח תזכורת אם לא מולא במשך 8 שעות (8:00-20:00)
                        </div>
                    </div>
                </div>
            </div>

            <!-- Timeline -->
            <div class="timeline">
                <h3>📅 ציר זמן - 7 ימים אחרונים</h3>
                ${timeline}
            </div>

            <!-- Quick Stats -->
            <div class="trigger-analysis" style="margin-top: 24px;">
                <h3>⚡ תובנות מהירות</h3>
                ${generateInsights()}
            </div>
        </div>
    `;
}

// Calculate usage statistics
function calculateUsageStats() {
    const totalEntries = entries.length;
    
    // Calculate active days
    const uniqueDays = new Set();
    entries.forEach(entry => {
        const date = new Date(entry.timestamp).toDateString();
        uniqueDays.add(date);
    });
    const activeDays = uniqueDays.size;
    
    // Average per day
    const avgPerDay = activeDays > 0 ? (totalEntries / activeDays).toFixed(1) : 0;
    
    // Last entry
    const lastEntry = entries.length > 0 
        ? formatTimeAgo(entries[entries.length - 1].timestamp)
        : 'אף פעם';
    
    // Completion rate (assuming 3 meals per day as target)
    const daysSinceFirst = entries.length > 0 
        ? Math.ceil((Date.now() - new Date(entries[0].timestamp).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
    const expectedEntries = daysSinceFirst * 3;
    const completionRate = expectedEntries > 0 
        ? Math.min(100, Math.round((totalEntries / expectedEntries) * 100))
        : 0;
    
    // Check if reminders are enabled
    const remindersEnabled = localStorage.getItem('reminders-enabled') !== 'false';
    
    return {
        totalEntries,
        activeDays,
        avgPerDay,
        lastEntry,
        completionRate,
        remindersEnabled
    };
}

// Generate timeline for last 7 days
function generateTimeline() {
    const timeline = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toDateString();
        
        // Get entries for this day
        const dayEntries = entries.filter(entry => {
            return new Date(entry.timestamp).toDateString() === dateStr;
        });
        
        const hasPain = dayEntries.some(e => e.pain);
        const badgeClass = dayEntries.length === 0 ? 'inactive' 
                          : dayEntries.length < 2 ? 'partial' 
                          : 'active';
        const badgeText = dayEntries.length === 0 ? 'לא מולא' 
                        : dayEntries.length < 2 ? `${dayEntries.length} רשומות` 
                        : `${dayEntries.length} רשומות ✓`;
        
        const mealsHtml = dayEntries.map(entry => {
            const painIcon = entry.pain ? ' ⚠️' : '';
            const mealDesc = entry.mealDescription ? `<br><span style="font-size: 11px; opacity: 0.8;">${entry.mealDescription.substring(0, 30)}${entry.mealDescription.length > 30 ? '...' : ''}</span>` : '';
            return `<div class="meal-bubble ${entry.pain ? 'with-pain' : ''}">
                ${entry.mealType}${painIcon}${mealDesc}
            </div>`;
        }).join('');
        
        timeline.push(`
            <div class="timeline-day ${dayEntries.length === 0 ? 'no-data' : ''} ${hasPain ? 'has-pain' : ''}">
                <div class="timeline-header">
                    <span class="timeline-date">${formatDate(date)}</span>
                    <span class="timeline-badge ${badgeClass}">${badgeText}</span>
                </div>
                ${dayEntries.length > 0 ? `<div class="timeline-meals">${mealsHtml}</div>` : 
                  '<div style="color: #9ca3af; font-size: 13px;">אין רשומות ליום זה</div>'}
            </div>
        `);
    }
    
    return timeline.join('');
}

// Generate insights
function generateInsights() {
    const stats = calculateStatistics();
    const insights = [];
    
    if (entries.length < 5) {
        insights.push(`
            <div style="padding: 12px; background: #eff6ff; border-radius: 8px; margin-bottom: 8px;">
                <strong>💡 עוד מעט נתונים...</strong><br>
                <span style="font-size: 14px; color: #6b7280;">צריך עוד כמה ימים כדי לזהות patterns ברורים</span>
            </div>
        `);
    }
    
    if (stats.painPercentage > 60) {
        insights.push(`
            <div style="padding: 12px; background: #fef2f2; border-radius: 8px; margin-bottom: 8px;">
                <strong>⚠️ שיעור כאבים גבוה</strong><br>
                <span style="font-size: 14px; color: #6b7280;">
                    ${stats.painPercentage}% מהארוחות גורמות לכאב - כדאי להתייעץ עם רופא
                </span>
            </div>
        `);
    }
    
    // Check for strong triggers
    Object.entries(stats.triggers).forEach(([key, data]) => {
        const names = {
            dairy: 'חלב/גבינה',
            gluten: 'קמח/גלוטן',
            fatty: 'אוכל שומני',
            fastEating: 'אכילה מהירה'
        };
        
        if (data.rate >= 75 && data.total >= 3) {
            insights.push(`
                <div style="padding: 12px; background: #fff7ed; border-radius: 8px; margin-bottom: 8px;">
                    <strong>🎯 Trigger חזוק: ${names[key]}</strong><br>
                    <span style="font-size: 14px; color: #6b7280;">
                        ${data.rate}% מהמקרים עם ${names[key]} גרמו לכאב
                    </span>
                </div>
            `);
        }
    });
    
    if (insights.length === 0) {
        insights.push(`
            <div style="padding: 12px; background: #f0fdf4; border-radius: 8px;">
                <strong>✅ הכול נראה טוב</strong><br>
                <span style="font-size: 14px; color: #6b7280;">
                    לא זוהו patterns חריגים עד כה
                </span>
            </div>
        `);
    }
    
    return insights.join('');
}

// Toggle reminders
function toggleReminders(element) {
    const isActive = element.classList.contains('active');
    
    if (isActive) {
        element.classList.remove('active');
        localStorage.setItem('reminders-enabled', 'false');
    } else {
        // Request permission if needed
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    element.classList.add('active');
                    localStorage.setItem('reminders-enabled', 'true');
                    subscribeToReminders();
                }
            });
        } else if (Notification.permission === 'granted') {
            element.classList.add('active');
            localStorage.setItem('reminders-enabled', 'true');
            subscribeToReminders();
        } else {
            alert('יש להפעיל הרשאות התראות בהגדרות הדפדפן');
        }
    }
}

// Format date helper
function formatDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
        return 'היום';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'אתמול';
    } else {
        const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
        return days[date.getDay()] + ' ' + date.getDate() + '/' + (date.getMonth() + 1);
    }
}

// Format time ago helper
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (minutes < 60) {
        return `לפני ${minutes} דקות`;
    } else if (hours < 24) {
        return `לפני ${hours} שעות`;
    } else if (days === 1) {
        return 'אתמול';
    } else {
        return `לפני ${days} ימים`;
    }
}

// Initialize on load
window.addEventListener('load', init);
