document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Configuration ---
    const firebaseConfig = {
        apiKey: "AIzaSyBNEcoTDURma0xQXlL9TJjV-aJnrc5NOOI", // YOUR_API_KEY
        authDomain: "datn-b86e9.firebaseapp.com", // YOUR_AUTH_DOMAIN
        databaseURL: "https://datn-b86e9-default-rtdb.firebaseio.com", // YOUR_DATABASE_URL
        projectId: "datn-b86e9", // YOUR_PROJECT_ID
        storageBucket: "datn-b86e9.firebasestorage.app", // YOUR_STORAGE_BUCKET
        messagingSenderId: "814841265586", // YOUR_MESSAGING_SENDER_ID
        appId: "1:814841265586:web:4ec357fcbe284f8edb38ab", // YOUR_APP_ID
        measurementId: "G-9L59JC3Q4T" // YOUR_MEASUREMENT_ID
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // --- State Variables ---
    let currentSelectedGardenId = localStorage.getItem('selectedGardenId') || null;
    let currentActiveTab = localStorage.getItem('activeTabId') || 'home';
    let firebaseListeners = [];
    let gardenChartInstances = {}; 
    let allGardensRawData = { garden1: {}, garden2: {} };
    let sessionHistory = { garden1: { temperature: [], humidity: [], soilMoisture: [], timestamps: [] }, garden2: { temperature: [], humidity: [], soilMoisture: [], timestamps: [] }};
    const MAX_HISTORY_POINTS = 30; 
    let gardenThresholds = { garden1: {}, garden2: {} }; 
    let sessionHistoryChartInstance = null;
    let sensorAlertPopupStatus = {}; // For one-time popup alerts: { gardenId: { sensorKey: { wasOutOfRange: false } } }


    // --- DOM Elements ---
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const gardenCards = document.querySelectorAll('.garden-card');

    const monitoringContentEl = document.getElementById('monitoring-content'); // For seasonal theme
    const monitoringTitleEl = document.getElementById('monitoring-title');
    const gardenDetailsContainerEl = document.getElementById('garden-details-container');
    const backToGardenSelectionBtnEl = document.getElementById('back-to-garden-selection');
    const exportExcelHomeBtnEl = document.getElementById('export-excel-home');
    const monitoringPlaceholderEl = document.getElementById('monitoring-placeholder');

    const historyTitleEl = document.getElementById('history-title');
    const historySelectionPlaceholderEl = document.getElementById('history-selection-placeholder');
    const historyDataViewEl = document.getElementById('history-data-view');
    const sensorHistorySelectEl = document.getElementById('sensor-history-select');

    const alertGardenSelectionPlaceholderEl = document.getElementById('alert-garden-selection-placeholder');
    const alertSettingsFormsContainerEl = document.getElementById('alert-settings-forms-container');
    const alertSettingsGardenTitleEl = document.getElementById('alert-settings-garden-title');
    const alertThresholdFormEl = document.getElementById('alert-threshold-form');
    
    const clearLocalSettingsBtnEl = document.getElementById('clear-local-settings-btn');
    const homeContentHeaderBarEl = document.querySelector('#home-content .header-bar');


    // --- Initialization ---
    initApp();

    function initApp() {
        updateSensorHistorySelect(); // Add "All" option
        setupEventListeners();
        loadAllGardensRawData(); 
        
        showTab(currentActiveTab, true); 

        if (currentSelectedGardenId) {
            preloadThresholdsForGarden(currentSelectedGardenId).then(() => {
                 // Ensure thresholds are loaded before potentially displaying details that might use them
                if (currentActiveTab === 'monitoring') {
                    displayGardenDetails(currentSelectedGardenId);
                } else if (currentActiveTab === 'history') {
                    prepareHistoryTab();
                } else if (currentActiveTab === 'alerts') {
                    prepareAlertsTab();
                }
            });
        } else {
            if (currentActiveTab === 'monitoring') showMonitoringPlaceholder(true);
            if (currentActiveTab === 'history') showHistoryPlaceholder(true);
            if (currentActiveTab === 'alerts') showAlertsPlaceholder(true);
            if (currentActiveTab === 'home') prepareHomeTabHero();
        }
         // Apply seasonal theme if monitoring tab is active and a garden is selected
        if (currentActiveTab === 'monitoring' && currentSelectedGardenId) {
            applySeasonalTheme();
        }
        if (currentActiveTab === 'home') {
            prepareHomeTabHero();
        }
    }
    function prepareHomeTabHero() {
        if (homeContentHeaderBarEl) {
            // Hide the default header bar on home tab if hero is shown
            homeContentHeaderBarEl.style.display = 'none';
        }
        // Logic to inject/ensure hero content is present can be added here if not static in HTML
    }


    function updateSensorHistorySelect() {
        if (sensorHistorySelectEl) {
            // Check if "All" option already exists
            if (!sensorHistorySelectEl.querySelector('option[value="all"]')) {
                const allOption = document.createElement('option');
                allOption.value = 'all';
                allOption.textContent = 'Tất cả thông số';
                sensorHistorySelectEl.prepend(allOption); // Add as the first option
            }
            sensorHistorySelectEl.value = 'all'; // Default to "All"
        }
    }

    function setupEventListeners() {
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = item.getAttribute('data-tab');
                showTab(tabId);
            });
        });

        gardenCards.forEach(card => {
            card.addEventListener('click', () => {
                const gardenId = card.getAttribute('data-garden');
                handleGardenSelection(gardenId);
                showTab('monitoring'); // Switch to monitoring tab after garden selection
            });
        });

        if (backToGardenSelectionBtnEl) {
            backToGardenSelectionBtnEl.addEventListener('click', () => {
                clearFirebaseListenersAndCharts();
                currentSelectedGardenId = null;
                localStorage.removeItem('selectedGardenId');
                if (monitoringContentEl) monitoringContentEl.className = 'tab-content'; // Clear theme
                showTab('home');
            });
        }
        // The export button might now be part of the hero if on home tab
        // Ensure it's correctly selected if its ID is used or handle it within hero logic
        const heroExportButton = document.getElementById('export-excel-hero-btn');
        if (heroExportButton) {
             heroExportButton.addEventListener('click', exportAllGardensDataToExcel);
        } else if (exportExcelHomeBtnEl) { // Fallback for original button if not in hero
            exportExcelHomeBtnEl.addEventListener('click', exportAllGardensDataToExcel);
        }


        if (sensorHistorySelectEl) {
            sensorHistorySelectEl.addEventListener('change', () => {
                if(currentSelectedGardenId) plotSessionHistoryChart(currentSelectedGardenId);
            });
        }
        if (alertThresholdFormEl) {
            alertThresholdFormEl.addEventListener('submit', handleSaveThresholds);
        }
        if (clearLocalSettingsBtnEl) {
            clearLocalSettingsBtnEl.addEventListener('click', () => {
                localStorage.removeItem('selectedGardenId');
                localStorage.removeItem('activeTabId');
                currentSelectedGardenId = null;
                currentActiveTab = 'home';
                sensorAlertPopupStatus = {}; // Reset popup status
                if (monitoringContentEl) monitoringContentEl.className = 'tab-content'; // Clear theme
                initApp(); 
                showToast('Cài đặt đã lưu trên trình duyệt đã được xóa!', 'info');
            });
        }
    }

    function showTab(tabId, isInitialLoad = false) {
        navItems.forEach(item => item.classList.toggle('active', item.getAttribute('data-tab') === tabId));
        tabContents.forEach(content => content.classList.toggle('active', content.id === tabId + '-content'));
        
        currentActiveTab = tabId;
        localStorage.setItem('activeTabId', tabId);
        
        // Clear seasonal theme if not on monitoring tab
        if (tabId !== 'monitoring' && monitoringContentEl) {
            monitoringContentEl.classList.remove('theme-spring', 'theme-summer', 'theme-autumn', 'theme-winter');
        }
        if (homeContentHeaderBarEl) { // Manage visibility of default home header
            homeContentHeaderBarEl.style.display = (tabId === 'home') ? 'none' : 'flex';
        }


        if (tabId === 'monitoring') {
            if (currentSelectedGardenId) {
                applySeasonalTheme();
                displayGardenDetails(currentSelectedGardenId);
            } else {
                 showMonitoringPlaceholder(true);
            }
        } else if (tabId === 'history') {
            prepareHistoryTab();
        } else if (tabId === 'alerts') {
            prepareAlertsTab();
        } else if (tabId === 'home') {
            prepareHomeTabHero();
        }
    }
    
    function handleGardenSelection(gardenId) {
        if (currentSelectedGardenId !== gardenId) { 
            clearFirebaseListenersAndCharts(); 
            resetSessionHistory(gardenId); 
            sensorAlertPopupStatus[gardenId] = {}; // Reset popup status for the new garden
        }
        currentSelectedGardenId = gardenId;
        localStorage.setItem('selectedGardenId', gardenId);
        preloadThresholdsForGarden(gardenId).then(() => {
            if (currentActiveTab === 'monitoring') { // If already on monitoring tab, refresh details
                 applySeasonalTheme();
                 displayGardenDetails(gardenId);
            } else if (currentActiveTab === 'alerts') {
                prepareAlertsTab(); // Refresh alerts tab with new garden's thresholds
            } else if (currentActiveTab === 'history') {
                prepareHistoryTab(); // Refresh history tab
            }
        });
    }

    // --- Seasonal Theme ---
    function getCurrentSeason() {
        const month = new Date().getMonth(); // 0 (Jan) to 11 (Dec)
        if (month >= 2 && month <= 4) return 'spring'; // Mar, Apr, May
        if (month >= 5 && month <= 7) return 'summer'; // Jun, Jul, Aug
        if (month >= 8 && month <= 10) return 'autumn'; // Sep, Oct, Nov
        return 'winter'; // Dec, Jan, Feb
    }

    function applySeasonalTheme() {
        if (monitoringContentEl && currentSelectedGardenId) { // Apply only if a garden is selected
            const season = getCurrentSeason();
            // Remove other theme classes before adding the new one
            monitoringContentEl.classList.remove('theme-spring', 'theme-summer', 'theme-autumn', 'theme-winter');
            monitoringContentEl.classList.add(`theme-${season}`);
        }
    }


    function showMonitoringPlaceholder(show = true) {
        if (monitoringPlaceholderEl) monitoringPlaceholderEl.style.display = show ? 'flex' : 'none';
        if (gardenDetailsContainerEl) gardenDetailsContainerEl.style.display = show ? 'none' : 'block';
        if (monitoringTitleEl) monitoringTitleEl.textContent = 'Chọn vườn để xem thông tin';
        if (backToGardenSelectionBtnEl) backToGardenSelectionBtnEl.style.display = 'none';
        if (monitoringContentEl && show) { // Clear theme when placeholder is shown
             monitoringContentEl.classList.remove('theme-spring', 'theme-summer', 'theme-autumn', 'theme-winter');
        }
    }

    function displayGardenDetails(gardenId) {
        if (!gardenId) { showMonitoringPlaceholder(true); return; }
        showMonitoringPlaceholder(false);
        applySeasonalTheme(); // Apply theme when details are shown
        if (monitoringTitleEl) monitoringTitleEl.textContent = `Giám Sát ${gardenId === 'garden1' ? 'Khu Vườn 1' : 'Khu Vườn 2'}`;
        if (backToGardenSelectionBtnEl) backToGardenSelectionBtnEl.style.display = 'inline-flex';

        if (Object.keys(gardenChartInstances).length === 0 || !firebaseListeners.some(l => l.gardenId === gardenId)) {
            clearFirebaseListenersAndCharts(); 
            initializeSensorCharts();
            fetchDataForGarden(gardenId);
            listenDeviceStatusForGarden(gardenId);
            setupControlButtons(gardenId);
        }
    }
    
    function clearFirebaseListenersAndCharts() {
        firebaseListeners.forEach(listener => {
            if (listener.ref && typeof listener.ref.off === 'function') {
                listener.ref.off(listener.eventType, listener.callback);
            }
        });
        firebaseListeners = [];
        destroyAllSensorCharts();
    }

    function addFirebaseListener(ref, eventType, callback, gardenId = null) {
        ref.on(eventType, callback); 
        firebaseListeners.push({ ref, eventType, callback, gardenId });
    }

    function loadAllGardensRawData() {
        const gardens = ['garden1', 'garden2'];
        const sensorPathsConfig = {
            garden1: { prefix: "", sensors: {"nhiet_do":"temperature", "do_am":"humidity", "do_am_dat":"soilMoisture", "anh_sang":"light"} },
            garden2: { prefix: "garden2/", sensors: {"nhiet_do":"temperature", "do_am":"humidity", "do_am_dat":"soilMoisture", "anh_sang":"light"} }
        };
        gardens.forEach(gardenKey => {
            const config = sensorPathsConfig[gardenKey];
            allGardensRawData[gardenKey] = allGardensRawData[gardenKey] || {}; // Ensure exists
            for (const [fbPath, localKey] of Object.entries(config.sensors)) {
                database.ref(config.prefix + fbPath).on("value", (snapshot) => {
                    const value = snapshot.val();
                    if (localKey === "light") {
                        allGardensRawData[gardenKey][localKey] = value !== null ? (convertToBoolean(value) ? "Ban Ngày" : "Ban Đêm") : "--";
                    } else {
                         allGardensRawData[gardenKey][localKey] = value !== null ? parseFloat(value).toFixed(localKey === "temperature" ? 1:0) : "--";
                    }
                });
            }
        });
    }
    
    function fetchDataForGarden(gardenId) {
        const basePath = gardenId === 'garden1' ? '' : 'garden2/';
        const sensorDisplayNames = { temperature: "Nhiệt độ", humidity: "Độ ẩm K.Khí", soilMoisture: "Độ ẩm đất", light: "Ánh sáng" };
        const gardenDisplayName = gardenId === 'garden1' ? 'Khu Vườn 1' : 'Khu Vườn 2';

        const sensorConfig = {
            "nhiet_do": { elId: "temperature-value", unit: "°C", chart: gardenChartInstances.temp, max: 50, historyKey: "temperature", precision: 1, rowId: "temp-row"},
            "do_am": { elId: "humidity-value", unit: "%", chart: gardenChartInstances.humidity, max: 100, historyKey: "humidity", precision: 0, rowId: "humid-row"},
            "do_am_dat": { elId: "soil-moisture-value", unit: "%", chart: gardenChartInstances.soilMoisture, max: 100, historyKey: "soilMoisture", precision: 0, rowId: "soil-row"}
        };

        Object.entries(sensorConfig).forEach(([path, config]) => {
            const sensorRef = database.ref(basePath + path);
            const callback = (snapshot) => {
                const value = snapshot.val();
                const numericVal = value !== null ? parseFloat(value) : null;
                
                document.getElementById(config.elId).innerText = numericVal !== null ? numericVal.toFixed(config.precision) + config.unit : `--${config.unit}`;
                if (config.chart) updateSensorChart(config.chart, numericVal, config.max);
                
                if (gardenId === currentSelectedGardenId) {
                    updateSessionHistory(gardenId, config.historyKey, numericVal);
                    checkAndApplyThresholdAlert(gardenId, config.historyKey, numericVal, config.rowId, sensorDisplayNames[config.historyKey], gardenDisplayName);
                }
            };
            addFirebaseListener(sensorRef, "value", callback, gardenId);
        });

        const lightRef = database.ref(basePath + "anh_sang");
        const lightCallback = (snapshot) => {
            const value = snapshot.val();
            const isDay = convertToBoolean(value); // true for Day, false for Night
            document.getElementById("light-value").innerText = value !== null ? (isDay ? "Ban Ngày" : "Ban Đêm") : "--";
            if (gardenId === currentSelectedGardenId) {
                 // For light, threshold check might be different (e.g., expected state vs actual)
                 // Not implementing popup for light as it's not numeric like others for min/max thresholds
                 checkAndApplyThresholdAlert(gardenId, "light", isDay, "light-row", sensorDisplayNames.light, gardenDisplayName);
            }
        };
        addFirebaseListener(lightRef, "value", lightCallback, gardenId);
    }

    function listenDeviceStatusForGarden(gardenId) {
        const basePath = gardenId === 'garden1' ? '' : 'garden2/';
        const devices = { "den": "bulb", "quat": "fan", "bom": "pump", "suong": "mist" };
        for (const [path, deviceName] of Object.entries(devices)) {
            const deviceRef = database.ref(basePath + path);
            const callback = (snapshot) => {
                updateDeviceButtonVisuals(deviceName, snapshot.val());
            };
            addFirebaseListener(deviceRef, "value", callback, gardenId);
        }
    }

    function updateDeviceButtonVisuals(device, statusFromFirebase) {
        const button = document.getElementById(device + "-button");
        const statusTextEl = document.getElementById(device + "-status-text"); 
        if (!button || !statusTextEl) return;

        const isDeviceOn = convertToBoolean(statusFromFirebase);

        if (isDeviceOn === true) {
            button.classList.remove("off");
            button.classList.add("on");
            button.textContent = "ON";
            statusTextEl.textContent = "Bật"; 
        } else {
            button.classList.remove("on");
            button.classList.add("off");
            button.textContent = "OFF";
            statusTextEl.textContent = "Tắt"; 
        }
    }

    function setupControlButtons(gardenId) {
        const controlPanel = document.querySelector('#monitoring-content .control-panel');
        if (!controlPanel) return;
        const controlButtons = controlPanel.querySelectorAll('.control-btn');
        
        controlButtons.forEach(button => {
            const newButton = button.cloneNode(true); 
            button.parentNode.replaceChild(newButton, button);

            newButton.addEventListener('click', () => {
                const deviceName = newButton.dataset.device;
                toggleDeviceState(gardenId, deviceName);
            });
        });
    }

    function toggleDeviceState(gardenId, deviceName) {
        if (!currentSelectedGardenId || currentSelectedGardenId !== gardenId) return; 

        const basePath = gardenId === 'garden1' ? '' : 'garden2/';
        const devicePathMap = { "bulb": "den", "fan": "quat", "pump": "bom", "mist": "suong" };
        const firebasePath = devicePathMap[deviceName];
        if (!firebasePath) return;

        const ref = database.ref(basePath + firebasePath);
        ref.once("value").then(snapshot => {
            const currentStatus = convertToBoolean(snapshot.val()); 
            const newStatus = !currentStatus; 
            ref.set(newStatus); 
        });
    }
    
    function convertToBoolean(value) {
        if (value === true || value === 1 || value === "1") {
            return true;
        }
        return false;
    }

    function initializeSensorCharts() {
        gardenChartInstances.temp = createSensorDoughnutChart('temperature-chart', 50, '#ff6384', '#ffb1c1');
        gardenChartInstances.humidity = createSensorDoughnutChart('humidity-chart', 100, '#36a2eb', '#a7d7f9');
        gardenChartInstances.soilMoisture = createSensorDoughnutChart('soil-moisture-chart', 100, '#4bc0c0', '#a0e1e1');
    }

    function createSensorDoughnutChart(canvasId, maxValue, colorActive, colorBg = '#e9ecef') {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return null;
        return new Chart(ctx, {
            type: 'doughnut',
            data: { datasets: [{ data: [0, maxValue], backgroundColor: [colorActive, colorBg], borderWidth: 0, }] },
            options: { responsive: false, maintainAspectRatio: false, cutout: '70%', rotation: -90, circumference: 360,
                         plugins: { legend: { display: false }, tooltip: { enabled: false } }, animation: { duration: 300 } }
        });
    }
    function updateSensorChart(chartInstance, newValue, maxValue) {
        if (chartInstance) {
            const val = newValue === null ? 0 : Math.max(0, Math.min(parseFloat(newValue), maxValue));
            chartInstance.data.datasets[0].data[0] = val;
            chartInstance.data.datasets[0].data[1] = Math.max(0, maxValue - val);
            chartInstance.update('none');
        }
    }
    function destroyAllSensorCharts() {
        Object.values(gardenChartInstances).forEach(chart => chart?.destroy());
        gardenChartInstances = {};
    }

    function resetSessionHistory(gardenId) {
        sessionHistory[gardenId] = { temperature: [], humidity: [], soilMoisture: [], timestamps: [] };
        if (currentActiveTab === 'history' && gardenId === currentSelectedGardenId) {
            plotSessionHistoryChart(gardenId); // Re-plot to show empty or new data
        }
    }

    function updateSessionHistory(gardenId, sensorKey, value) {
        if (!sessionHistory[gardenId] || value === null || sensorKey === 'light') return; // Don't store light in this numeric history

        const gardenHist = sessionHistory[gardenId];
        const dataArray = gardenHist[sensorKey];
        
        dataArray.push(value);
        if (dataArray.length > MAX_HISTORY_POINTS) {
            dataArray.shift();
        }

        // Manage timestamps centrally for the garden
        // Add timestamp if this is the first update in a potential batch, or if timestamps are lagging
        if (sensorKey === 'temperature' || gardenHist.timestamps.length < Math.max(gardenHist.temperature.length, gardenHist.humidity.length, gardenHist.soilMoisture.length) ) {
            gardenHist.timestamps.push(new Date());
            if (gardenHist.timestamps.length > MAX_HISTORY_POINTS) {
                gardenHist.timestamps.shift();
            }
        }
       
        if (currentActiveTab === 'history' && gardenId === currentSelectedGardenId) {
            plotSessionHistoryChart(gardenId);
        }
    }
    
    function prepareHistoryTab() {
        if (currentSelectedGardenId) {
            if (historyTitleEl) historyTitleEl.textContent = `Lịch Sử Phiên - ${currentSelectedGardenId === 'garden1' ? 'Khu Vườn 1' : 'Khu Vườn 2'}`;
            if (historySelectionPlaceholderEl) historySelectionPlaceholderEl.style.display = 'none';
            if (historyDataViewEl) historyDataViewEl.style.display = 'block';
            if (!sensorHistorySelectEl.value) sensorHistorySelectEl.value = 'all'; // Default if not set
            plotSessionHistoryChart(currentSelectedGardenId);
        } else {
            showHistoryPlaceholder(true);
        }
    }
    function showHistoryPlaceholder(show = true) {
        if (historyTitleEl) historyTitleEl.textContent = `Lịch Sử Dữ Liệu Phiên`;
        if (historySelectionPlaceholderEl) historySelectionPlaceholderEl.style.display = show ? 'flex' : 'none';
        if (historyDataViewEl) historyDataViewEl.style.display = show ? 'none' : 'block';
        if (sessionHistoryChartInstance) { sessionHistoryChartInstance.destroy(); sessionHistoryChartInstance = null; }
    }

    const chartColors = { // Define colors centrally for history charts
        temperature: { border: 'rgba(255, 99, 132, 1)', background: 'rgba(255, 99, 132, 0.2)', label: 'Nhiệt độ (°C)' },
        humidity: { border: 'rgba(54, 162, 235, 1)', background: 'rgba(54, 162, 235, 0.2)', label: 'Độ ẩm K.Khí (%)' },
        soilMoisture: { border: 'rgba(75, 192, 192, 1)', background: 'rgba(75, 192, 192, 0.2)', label: 'Độ ẩm Đất (%)' }
    };

    function plotSessionHistoryChart(gardenId) {
        if (!gardenId || !sessionHistory[gardenId] || !sensorHistorySelectEl) return;
        
        const selectedSensorOrAll = sensorHistorySelectEl.value;
        const gardenHist = sessionHistory[gardenId];
        const timestamps = gardenHist.timestamps.map(ts => ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit'}));

        const ctx = document.getElementById('session-history-chart')?.getContext('2d');
        if (!ctx) return;

        if (sessionHistoryChartInstance) {
            sessionHistoryChartInstance.destroy();
        }

        let datasets = [];
        let chartOptions = {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { legend: { labels: { color: '#34495e' } } },
            scales: { x: { ticks: { color: '#34495e', autoSkipPadding: 10, maxRotation: 0, minRotation: 0 } } }
        };

        if (selectedSensorOrAll === 'all') {
            const sensorTypes = ['temperature', 'humidity', 'soilMoisture'];
            sensorTypes.forEach((type, index) => {
                const sensorData = gardenHist[type] || [];
                 // Ensure data and timestamps align by taking the most recent data points
                const alignedTimestamps = timestamps.slice(-sensorData.length);

                datasets.push({
                    label: chartColors[type].label,
                    data: sensorData,
                    borderColor: chartColors[type].border,
                    backgroundColor: chartColors[type].background, // For area under line, if used
                    fill: false,
                    tension: 0.3,
                    yAxisID: `y${index}`
                });
            });
            chartOptions.scales.y0 = { type: 'linear', display: true, position: 'left', title: { display: true, text: chartColors.temperature.label, color: chartColors.temperature.border }, ticks: { color: chartColors.temperature.border } };
            chartOptions.scales.y1 = { type: 'linear', display: true, position: 'right', title: { display: true, text: chartColors.humidity.label, color: chartColors.humidity.border }, ticks: { color: chartColors.humidity.border }, grid: { drawOnChartArea: false } };
            chartOptions.scales.y2 = { type: 'linear', display: true, position: 'right', title: { display: true, text: chartColors.soilMoisture.label, color: chartColors.soilMoisture.border }, ticks: { color: chartColors.soilMoisture.border }, grid: { drawOnChartArea: false }, offset: true }; // 'offset' might not be a standard Chart.js v3 option, remove if problematic. Check documentation for exact positioning. Consider placing one on far right if 'offset' causes issues.
             // For Chart.js v3, to place y2 further right, you might need to adjust its 'grace' or manually manage ticks if it overlaps y1.
            // A common approach for a third axis on the right is to control its distance using padding or by adjusting the chart layout.
            // If y2 overlaps y1 significantly, consider another left axis or styling changes. For now, this is a standard multi-axis setup.


        } else {
            const sensorData = gardenHist[selectedSensorOrAll] || [];
            const alignedTimestamps = timestamps.slice(-sensorData.length);
            datasets.push({
                label: chartColors[selectedSensorOrAll].label,
                data: sensorData,
                borderColor: chartColors[selectedSensorOrAll].border,
                backgroundColor: chartColors[selectedSensorOrAll].background,
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointHoverRadius: 5
            });
            chartOptions.scales.y = { beginAtZero: false, ticks: { color: '#34495e' }, title: { display: true, text: chartColors[selectedSensorOrAll].label, color: chartColors[selectedSensorOrAll].border }};
        }
        
        // Ensure timestamps are aligned for all datasets in 'all' mode if lengths differ
        // The current logic takes the latest `MAX_HISTORY_POINTS` for each sensor and for timestamps.
        // For plotting, use the shortest length among timestamps and active datasets for 'all' view,
        // or align each dataset with the main timestamps array using `slice`.
        // The per-dataset `alignedTimestamps` slice aims to handle this.

        sessionHistoryChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timestamps.slice(-Math.max(...datasets.map(ds => ds.data.length), 0)), // Use timestamps relevant to plotted data
                datasets: datasets
            },
            options: chartOptions
        });
    }


    async function preloadThresholdsForGarden(gardenId) {
        if (!gardenId) return Promise.resolve();
        const path = `garden_settings/${gardenId}/thresholds`;
        try {
            const snapshot = await database.ref(path).once('value');
            gardenThresholds[gardenId] = snapshot.val() || {};
        } catch (error) {
            console.error("Lỗi tải ngưỡng:", error);
            gardenThresholds[gardenId] = {};
        }
    }
    
    function prepareAlertsTab() {
        if (currentSelectedGardenId) {
            if (alertSettingsGardenTitleEl) alertSettingsGardenTitleEl.textContent = `Cài đặt cho ${currentSelectedGardenId === 'garden1' ? 'Khu Vườn 1' : 'Khu Vườn 2'}`;
            if (alertGardenSelectionPlaceholderEl) alertGardenSelectionPlaceholderEl.style.display = 'none';
            if (alertSettingsFormsContainerEl) alertSettingsFormsContainerEl.style.display = 'block';
            loadThresholdsToForm(currentSelectedGardenId);
        } else {
            showAlertsPlaceholder(true);
        }
    }
    function showAlertsPlaceholder(show = true) {
        if (alertGardenSelectionPlaceholderEl) alertGardenSelectionPlaceholderEl.style.display = show ? 'flex' : 'none';
        if (alertSettingsFormsContainerEl) alertSettingsFormsContainerEl.style.display = show ? 'none' : 'block';
        if (alertThresholdFormEl && show) alertThresholdFormEl.reset(); 
    }

    function loadThresholdsToForm(gardenId) {
        const thresholds = gardenThresholds[gardenId] || {};
        if (alertThresholdFormEl) {
            alertThresholdFormEl.elements['temperature_min'].value = thresholds.temperature_min ?? '';
            alertThresholdFormEl.elements['temperature_max'].value = thresholds.temperature_max ?? '';
            alertThresholdFormEl.elements['humidity_min'].value = thresholds.humidity_min ?? '';
            alertThresholdFormEl.elements['humidity_max'].value = thresholds.humidity_max ?? '';
            alertThresholdFormEl.elements['soilMoisture_min'].value = thresholds.soilMoisture_min ?? '';
            alertThresholdFormEl.elements['soilMoisture_max'].value = thresholds.soilMoisture_max ?? '';
        }
    }

    function handleSaveThresholds(event) {
        event.preventDefault();
        if (!currentSelectedGardenId) {
            showToast('Vui lòng chọn vườn trước khi lưu ngưỡng!', 'error', { gravity: "top", position: "right" });
            return;
        }
        const formData = new FormData(alertThresholdFormEl);
        const newThresholds = {};
        let isValid = true;

        const tempMin = formData.get('temperature_min');
        const tempMax = formData.get('temperature_max');
        const humidMin = formData.get('humidity_min');
        const humidMax = formData.get('humidity_max');
        const soilMin = formData.get('soilMoisture_min');
        const soilMax = formData.get('soilMoisture_max');

        if (tempMin !== "" && tempMax !== "" && parseFloat(tempMin) > parseFloat(tempMax)) {
            showToast('Nhiệt độ: Giá trị Min không được lớn hơn Max.', 'error', { gravity: "top", position: "right" }); isValid = false;
        }
        if (humidMin !== "" && humidMax !== "" && parseFloat(humidMin) > parseFloat(humidMax)) {
            showToast('Độ ẩm K.Khí: Giá trị Min không được lớn hơn Max.', 'error', { gravity: "top", position: "right" }); isValid = false;
        }
        if (soilMin !== "" && soilMax !== "" && parseFloat(soilMin) > parseFloat(soilMax)) {
            showToast('Độ ẩm Đất: Giá trị Min không được lớn hơn Max.', 'error', { gravity: "top", position: "right" }); isValid = false;
        }

        if (!isValid) return;

        for (let [key, value] of formData.entries()) {
            if (value !== "") newThresholds[key] = parseFloat(value); 
            else { delete newThresholds[key]; }
        }
        
        const path = `garden_settings/${currentSelectedGardenId}/thresholds`;
        database.ref(path).set(newThresholds)
            .then(() => {
                gardenThresholds[currentSelectedGardenId] = newThresholds; 
                showToast('Đã lưu ngưỡng cảnh báo thành công!', 'success', { gravity: "top", position: "right" });
            })
            .catch(error => {
                console.error("Lỗi lưu ngưỡng:", error);
                showToast('Lỗi khi lưu ngưỡng. Vui lòng thử lại.', 'error', { gravity: "top", position: "right" });
            });
    }

    function checkAndApplyThresholdAlert(gardenId, sensorKey, currentValue, rowId, sensorDisplayName, gardenDisplayName) {
        const rowElement = document.getElementById(rowId);
        if (!rowElement) return; 
        rowElement.className = 'sensor-row'; // Reset class

        if (currentValue === null || currentValue === undefined || sensorKey === 'light') return; 

        const thresholds = gardenThresholds[gardenId];
        if (!thresholds || Object.keys(thresholds).length === 0) return;
        
        const min = thresholds[`${sensorKey}_min`];
        const max = thresholds[`${sensorKey}_max`];
        
        let isOutOfRange = (min !== undefined && currentValue < min) || (max !== undefined && currentValue > max);
        
        // Initialize popup status if not present
        sensorAlertPopupStatus[gardenId] = sensorAlertPopupStatus[gardenId] || {};
        sensorAlertPopupStatus[gardenId][sensorKey] = sensorAlertPopupStatus[gardenId][sensorKey] || { wasOutOfRange: false };
        let currentSensorPopupState = sensorAlertPopupStatus[gardenId][sensorKey];

        if (isOutOfRange) {
            rowElement.classList.add('alert-danger');
            if (!currentSensorPopupState.wasOutOfRange) { // Just crossed the threshold for the first time (or after being back in range)
                showToast(
                    `CẢNH BÁO ${gardenDisplayName.toUpperCase()}: ${sensorDisplayName} (${currentValue}${sensorKey === 'temperature' ? '°C':'%'}) hiện đang ngoài ngưỡng an toàn!`, 
                    'error', 
                    { duration: 5000, gravity: "bottom", position: "right" }
                );
            }
            currentSensorPopupState.wasOutOfRange = true;
        } else {
            // Value is within range
            if (currentSensorPopupState.wasOutOfRange) { // Was previously out of range, now back in
                 showToast(
                    `${gardenDisplayName}: ${sensorDisplayName} đã trở lại ngưỡng an toàn.`, 
                    'success', 
                    { duration: 3000, gravity: "bottom", position: "right" }
                );
            }
            currentSensorPopupState.wasOutOfRange = false; // Reset status
        }
    }

    function showToast(message, type = 'info', options = {}) { 
        let backgroundColor;
        switch (type) {
            case 'success': backgroundColor = "linear-gradient(to right, #00b09b, #96c93d)"; break;
            case 'error': backgroundColor = "linear-gradient(to right, #ff5f6d, #ffc371)"; break;
            case 'warning': backgroundColor = "linear-gradient(to right, #f7971e, #ffd200)"; break;
            default: backgroundColor = "linear-gradient(to right, #007bff, #00a1ff)"; 
        }
        const toastOptions = {
            text: message, 
            duration: options.duration || 3000, 
            close: true, 
            gravity: options.gravity || "top", // "top", "bottom"
            position: options.position || "right", // "left", "center", "right"
            stopOnFocus: true,
            style: { background: backgroundColor, borderRadius: "6px", boxShadow: "0 3px 7px rgba(0,0,0,0.2)" },
            ...options // Spread any additional options
        };
        Toastify(toastOptions).showToast();
    }

    function exportAllGardensDataToExcel() { 
        if (!allGardensRawData.garden1 || !allGardensRawData.garden2 ||(Object.keys(allGardensRawData.garden1).length === 0 && Object.keys(allGardensRawData.garden2).length === 0)) {
            showToast("Chưa có dữ liệu để xuất. Vui lòng đợi hoặc kiểm tra kết nối.", "warning");
            return;
        }
        const dataToExport = [
            ["Thông số", "Khu Vườn 1", "Khu Vườn 2"],
            ["Nhiệt độ (°C)", allGardensRawData.garden1.temperature ?? '--', allGardensRawData.garden2.temperature ?? '--'],
            ["Độ ẩm K.Khí (%)", allGardensRawData.garden1.humidity ?? '--', allGardensRawData.garden2.humidity ?? '--'],
            ["Độ ẩm Đất (%)", allGardensRawData.garden1.soilMoisture ?? '--', allGardensRawData.garden2.soilMoisture ?? '--'],
            ["Ánh sáng", allGardensRawData.garden1.light ?? '--', allGardensRawData.garden2.light ?? '--']
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(dataToExport);
        XLSX.utils.book_append_sheet(wb, ws, "DuLieuVuonTongHop");
        const now = new Date();
        const fileName = `DuLieuVuon_${now.getDate()}-${now.getMonth()+1}-${now.getFullYear()}_${now.getHours()}h${now.getMinutes()}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showToast("Đã xuất dữ liệu Excel thành công!", "success", {gravity: "top", position: "right"});
    }

}); // End DOMContentLoaded