let mainData = {};
let currentCourseData = {};
let currentFolderStack = [];
let favorites = JSON.parse(localStorage.getItem('studybee_favs')) || [];
let currentHomeView = 'all'; 
let selectedCourseId = null;
let hlsInstance = null; 

// 🔑 DECRYPTION KEY CONFIGURATION
const DECRYPTION_KEY = 'ali000786'; // Apni key yahan change karein

// 1. INITIAL DATA LOADING
async function loadData() {
    try {
        const response = await fetch('courses.json');
        mainData = await response.json();
        setupCustomPlayerListeners(); 
        route();
    } catch (error) {
        console.error("courses.json file missing or fetch error:", error);
    }
}

// RECURSIVE HELPER TO FIND VIDEO BY ID
function findVideoById(items, videoId) {
    if (!items) return null;
    for (let item of items) {
        if (item.type === 'video' && item.id === videoId) {
            return item; 
        }
        if (item.type === 'folder' && item.items) {
            let found = findVideoById(item.items, videoId);
            if (found) return found; 
        }
    }
    return null;
}

// 2. SMART HASH ROUTING ENGINE
async function route() {
    const hash = window.location.hash; 
    const pathParts = hash.split('/'); 
    
    let courseId = null;
    let videoId = null;

    const courseIndex = pathParts.indexOf('course');
    if (courseIndex !== -1 && pathParts[courseIndex + 1]) {
        courseId = pathParts[courseIndex + 1];
    }
    
    const videoIndex = pathParts.indexOf('video');
    if (videoIndex !== -1 && pathParts[videoIndex + 1]) {
        videoId = pathParts[videoIndex + 1];
    }

    if (courseId && mainData.courses && mainData.courses[courseId]) {
        selectedCourseId = courseId;
        
        try {
            const response = await fetch(`courses/course_${courseId}.json`);
            currentCourseData = await response.json();
        } catch (err) {
            currentCourseData = { overview_images: [], overview_text: "Data load error or missing local file.", content: [] };
        }

        if (videoId) {
            const videoObj = findVideoById(currentCourseData.content, videoId);
            if (videoObj) {
                showScreen('video');
                playFullPageVideo(videoObj.url, videoObj.title); 
            } else {
                console.error("Video not found!");
                showScreen('course');
                switchCourseTab('content');
            }
        } else {
            showScreen('course');
            switchCourseTab('overview'); 
        }
    } else {
        selectedCourseId = null;
        showScreen('home');
        filterCourses();
    }
}

// 3. SCREEN SWITCHER CONTROLLER
function showScreen(screenName) {
    document.getElementById('batchesView').classList.add('hidden');
    document.getElementById('courseDetailView').classList.add('hidden');
    document.getElementById('videoPageView').classList.add('hidden');
    document.getElementById('homeNavButtons').classList.add('hidden');
    document.getElementById('backBtn').classList.remove('hidden');

    if (screenName !== 'video') {
        const video = document.getElementById('my_video');
        video.pause();
        video.src = "";
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        document.getElementById('customPlayBtn').innerText = '▶';
        document.getElementById('customProgressBar').style.width = '0%';
    }

    if (screenName === 'home') {
        document.getElementById('batchesView').classList.remove('hidden');
        document.getElementById('homeNavButtons').classList.remove('hidden');
        document.getElementById('backBtn').classList.add('hidden');
    } else if (screenName === 'course') {
        document.getElementById('courseDetailView').classList.remove('hidden');
    } else if (screenName === 'video') {
        document.getElementById('videoPageView').classList.remove('hidden');
    }
}

// 4. HOME PAGE RENDERER
function filterCourses() {
    const query = document.getElementById('searchBar').value.toLowerCase();
    const grid = document.getElementById('coursesGrid');
    grid.innerHTML = '';
    if(!mainData.courses) return;

    Object.keys(mainData.courses).forEach(id => {
        const course = mainData.courses[id];
        const matches = course.title.toLowerCase().includes(query);
        const isFav = favorites.includes(id);

        if (currentHomeView === 'fav' && !isFav) return; 
        if (!matches) return;

        grid.innerHTML += `
            <div class="card" onclick="navigateToCourse('${id}')">
                <span class="fav-star ${isFav ? 'active' : ''}" onclick="toggleFav(event, '${id}')">★</span>
                <img src="${course.thumbnail}" style="width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:8px; margin-bottom:12px;">
                <div class="card-title">${course.title}</div>
                <div style="color:#ffb703; font-weight:700; font-size:14px; margin-top:5px;">${course.price}</div>
            </div>
        `;
    });
}

function toggleHomeTab(type) {
    currentHomeView = type;
    document.getElementById('allTab').classList.toggle('active', type === 'all');
    document.getElementById('favTab').classList.toggle('active', type === 'fav');
    filterCourses();
}

function toggleFav(e, id) {
    e.stopPropagation();
    favorites = favorites.includes(id) ? favorites.filter(f => f !== id) : [...favorites, id];
    localStorage.setItem('studybee_favs', JSON.stringify(favorites));
    filterCourses();
}

function switchCourseTab(tab) {
    const course = mainData.courses[selectedCourseId];
    document.getElementById('bannerTitle').innerText = course.title;
    document.getElementById('bannerImage').src = course.thumbnail;

    if (tab === 'overview') {
        document.getElementById('tabOverview').classList.add('active');
        document.getElementById('tabContent').classList.remove('active');
        document.getElementById('overviewPanel').classList.remove('hidden');
        document.getElementById('contentPanel').classList.add('hidden');

        const imgArea = document.getElementById('overviewImagesArea');
        imgArea.innerHTML = '';
        (currentCourseData.overview_images || []).forEach(url => {
            imgArea.innerHTML += `<img src="${url}" class="overview-img">`;
        });
        document.getElementById('overviewText').innerText = currentCourseData.overview_text || '';
    } else {
        document.getElementById('tabOverview').classList.remove('active');
        document.getElementById('tabContent').classList.add('active');
        document.getElementById('overviewPanel').classList.add('hidden');
        document.getElementById('contentPanel').classList.remove('hidden');
        renderDirectory();
    }
}

function renderDirectory() {
    let items = currentCourseData.content || [];
    let currentPath = "ROOT DIRECTORY";

    currentFolderStack.forEach(idx => {
        currentPath += ` > ${items[idx].name}`;
        items = items[idx].items;
    });

    document.getElementById('dirStatus').innerText = `📁 ${currentPath}`;
    const grid = document.getElementById('directoryGrid');
    grid.innerHTML = '';

    items.forEach((item, index) => {
        if (item.type === 'folder') {
            grid.innerHTML += `
                <div class="card" onclick="pushFolder(${index})">
                    <div class="folder-icon">📁</div>
                    <div class="card-title">${item.name}</div>
                    <div class="card-meta">FOLDERS ${item.items ? item.items.length : 0}</div>
                </div>
            `;
        } else if (item.type === 'video') {
            let thumbnailHTML = item.thumbnail ? 
                `<img src="${item.thumbnail}" style="width:100%; aspect-ratio:16/9; object-fit:cover; border-radius:8px; margin-bottom:12px; background:#222;">` 
                : `<div class="folder-icon">📺</div>`;

            grid.innerHTML += `
                <div class="card" onclick="openVideoPage('${item.id}')">
                    ${thumbnailHTML}
                    <div class="card-title">${item.title}</div>
                    <div class="card-meta">VIDEO LECTURE</div>
                </div>
            `;
        } else {
            grid.innerHTML += `
                <div class="card" onclick="window.open('${item.url}', '_blank')">
                    <div class="folder-icon">📄</div>
                    <div class="card-title">${item.title}</div>
                    <div class="card-meta">PDF DOCUMENT</div>
                </div>
            `;
        }
    });
}

// NAVIGATION HANDLERS
function navigateToCourse(id) {
    window.location.hash = `/course/${id}`;
    window.scrollTo(0, 0);
}

function openVideoPage(videoId) {
    window.location.hash = `/course/${selectedCourseId}/video/${videoId}`;
    window.scrollTo(0, 0);
}

function goHome() {
    window.location.hash = '/';
    currentFolderStack = [];
}

// 🎬 AUTOMATIC VIDEO DECRYPTION ENGINE
function playFullPageVideo(videoSrc, title) {
    // Check if URL is encrypted (Does not start with http)
    if (videoSrc && !videoSrc.startsWith('http')) {
        try {
            const bytes = CryptoJS.AES.decrypt(videoSrc, DECRYPTION_KEY);
            const decryptedSrc = bytes.toString(CryptoJS.enc.Utf8);
            if (decryptedSrc) {
                videoSrc = decryptedSrc; 
            } else {
                console.error("Decryption string error. Invalid Key.");
                return;
            }
        } catch(e) {
            console.error("CryptoJS Decryption failure.");
            return;
        }
    }

    const video = document.getElementById('my_video');
    document.getElementById('videoTitleDisplay').innerText = title;

    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    const lowerSrc = videoSrc.toLowerCase();

    if (lowerSrc.includes('.mp4') || lowerSrc.includes('googlevideo.com') || lowerSrc.includes('mime=video')) {
        video.src = videoSrc;
        video.load();
        video.play();
    } 
    else {
        if (Hls.isSupported()) {
            hlsInstance = new Hls();
            hlsInstance.loadSource(videoSrc);
            hlsInstance.attachMedia(video);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
                video.play();
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = videoSrc;
            video.addEventListener('loadedmetadata', function () {
                video.play();
            });
        }
    }
}

// VIDEO PLAYER NATIVE LISTENERS
function setupCustomPlayerListeners() {
    const video = document.getElementById('my_video');
    const progressBar = document.getElementById('customProgressBar');
    const timeDisplay = document.getElementById('customTimeDisplay');
    const playBtn = document.getElementById('customPlayBtn');

    video.addEventListener('timeupdate', () => {
        if (video.duration) {
            const percentage = (video.currentTime / video.duration) * 100;
            progressBar.style.width = percentage + '%';
            timeDisplay.innerText = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
        }
    });

    video.addEventListener('loadedmetadata', () => {
        timeDisplay.innerText = `00:00 / ${formatTime(video.duration)}`;
    });

    video.addEventListener('play', () => { playBtn.innerText = '⏸'; });
    video.addEventListener('pause', () => { playBtn.innerText = '▶'; });
}

function togglePlay() {
    const video = document.getElementById('my_video');
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

function seekVideo(e) {
    const video = document.getElementById('my_video');
    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    if (video.duration) {
        video.currentTime = clickPosition * video.duration;
    }
}

function toggleFullscreen() {
    const wrapper = document.getElementById('videoWrapper');
    if (!document.fullscreenElement) {
        wrapper.requestFullscreen().catch(err => console.error(err));
    } else {
        document.exitFullscreen();
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function pushFolder(idx) {
    currentFolderStack.push(idx);
    renderDirectory();
}

function handleBack() {
    const hash = window.location.hash;
    if (hash.includes('/video/')) {
        window.location.hash = `/course/${selectedCourseId}`;
    } else if (currentFolderStack.length > 0) {
        currentFolderStack.pop();
        renderDirectory();
    } else {
        window.location.hash = '/';
    }
}

// WINDOW BINDINGS
window.onload = loadData;
window.onhashchange = route;