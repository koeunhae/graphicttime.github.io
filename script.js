document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.querySelector('.canvas');
    canvas.innerHTML = ''; // 기존의 단일 요소 제거 후 10개로 자동 증식

    // 파일 배포 시 이 버전 문자열을 변경하면 브라우저 캐시가 갱신됩니다
    const CACHE_VER = '20260615c';

    const TOTAL_CHIPS = 19;
    // 명명 규칙에 따라 초코+2~10번까지 총 10개의 묶음 이름 배열 선언 (2번은 choco-chip으로 대체)
    const clusterNames = ["초코브라우니", "초코칩쿠키", "크림뷔렐레", "파베초콜릿", "스노우볼쿠키", "버터쿠키", "7", "8", "9", "10"];
    const clustersData = [];

    // 전역 무한 캔버스 이동 및 축척 관리 변수
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let iconsHidden = false;
    
    let currentIndex = 1;
    let direction = 1; // 1: 다음(오른쪽), -1: 이전(왼쪽)
    const TOTAL_CLUSTERS = clusterNames.length;


    // 【원형 겹침 clip-path】 마지막 칩(N)이 1번과 겹치는 우측 부분만 잘라내어 1번 밑으로 들어가 보이게 함.
    // 【원형 겹침 clip-path】 1번 칩(0도) 위로 올라타는 마지막 N번 및 N-1번째 칩들이
    // 1번보다 뒤에 위치하는 것처럼 보이기 위해 좌측 Y축(수직선)을 넘는 우측을 잘라냅니다.
    // transform-origin: 0% 100% 기준으로 정확한 수학적 폴리곤을 계산하여 교차점만 제거합니다.
    function applyCircularClip(container) {
        const chips = container.querySelectorAll('.chip');
        const count = chips.length;
        if(count === 0) return;
        
        const width = 143;
        const height = 403;
        
        for (let i = 0; i < count; i++) {
            const angleDeg = i * 360 / count;
            // 1번 칩(0도) 기준 좌측(-x 영역)에 분포하고 있지만, 회전으로 인해 1번 칩 쪽(+x 영역)으로 넘어오는 칩들
            if (angleDeg > 270) {
                const A = 360 - angleDeg; // 수직선 기준 벌어진 각도
                const tanA = Math.tan(A * Math.PI / 180);
                const target_x = height * tanA; // 수직선이 칩의 상단(y=0)과 만나는 x좌표
                
                // 자르는 선을 무한히 연장한 거대한 4각 폴리곤 (상단 -100%, 하단 200%까지).
                // 이렇게 하면 좌측과 하단의 그림자는 잘리지 않고, 1번 칩을 침범하는 우측 영역만 깨끗하게 잘려나갑니다.
                const pctX = (target_x / width) * 100;
                
                // 수학적 완전 평면: (Top-Left, Top-Right, Bottom-Right, Bottom-Left)
                // 좌측 영역을 모두 포함하여 그림자(box-shadow) 보호!
                // Top-Right의 X: 선형 방정식에 의해 y=-100%일 때 X는 2배.
                // Bottom-Right의 X: y=200%일 때 평행이동에 의해 X는 -1배.
                const x_top = 2 * pctX;
                const x_bottom = -pctX;
                
                const polygon = `polygon(-200% -100%, ${x_top}% -100%, ${x_bottom}% 200%, -200% 200%)`;
                
                chips[i].style.clipPath = polygon;
            } else {
                chips[i].style.clipPath = '';
            }
        }
    }
    
    function removeCircularClip(container) {
        container.querySelectorAll('.chip').forEach(c => c.style.clipPath = '');
    }

    // 클러스터 상태 초기화 함수
    function resetCluster(cluster) {
        cluster.classList.remove('expanded', 'has-popped', 'flipped-all');
        cluster.querySelectorAll('.chip').forEach(chip => {
            chip.classList.remove('popped', 'flipped');
        chip.style.clipPath = '';
            const vid = chip.querySelector('video');
            if (vid) {
                vid.pause();
                vid.currentTime = 0;
            }
        });
        // 클로저 변수(isExpanded, isFlippedAll)도 함께 초기화
        if (typeof cluster._resetState === 'function') {
            cluster._resetState();
        }
    }

    function resetAllClusters() {
        globalPoppedChip = null;
        document.body.classList.remove('chip-popped');
        document.querySelectorAll('.cluster').forEach(cluster => {
            resetCluster(cluster);
        });
    }

    // 모든 클러스터에 동일한 공통 이동값을 합성하여 부여
    const updateTransforms = () => {
        document.querySelectorAll('.chip-container').forEach(container => {
            const i = Number(container.dataset.index);
            if (i === currentIndex) {
                // 현재 클러스터 중앙 위치 + 드래그(offset) + 기본 Y축 오프셋(-65 픽셀로 변경)
                container.style.transform = `translate(${offsetX}px, ${offsetY - 65}px) scale(${scale})`;
                container.style.opacity = '1';
                container.style.pointerEvents = 'auto';
            } else {
                // 이동 방향에 따라 위치 분기 처리
                if (direction === 1) {
                    container.style.transform = `translate(calc(-100vw + ${offsetX}px), ${offsetY - 65}px) scale(${scale})`;
                } else {
                    container.style.transform = `translate(calc(100vw + ${offsetX}px), ${offsetY - 65}px) scale(${scale})`;
                }
                container.style.opacity = '0';
                container.style.pointerEvents = 'none';
            }
        });
    };

    // 현재 열려있는 단 1장의 그래픽 칩을 전역적으로 관리하여 버그 차단
    let globalPoppedChip = null;

    function updateIconVisibility() {
        const cookieIcon = document.querySelector('.floating-cookie');
        const brownieIcon = document.querySelector('.floating-brownie');
        const bruleeIcon = document.querySelector('.floating-brulee');
        const paveIcon = document.querySelector('.floating-pave');
        const snowballIcon = document.querySelector('.floating-snowball');
        const butterIcon = document.querySelector('.floating-butter');
        if (!cookieIcon || !brownieIcon || !bruleeIcon || !paveIcon || !snowballIcon) return;

        // 로고 더블클릭으로 아이콘 숨김 상태이면 전부 숨김 유지
        if (iconsHidden) {
            cookieIcon.style.display = 'none';
            brownieIcon.style.display = 'none';
            bruleeIcon.style.display = 'none';
            paveIcon.style.display = 'none';
            snowballIcon.style.display = 'none';
            if (butterIcon) butterIcon.style.display = 'none';
            return;
        }
        
        // 더블클릭으로 한 장 보는 중이면 전부 숨김
        if (globalPoppedChip) {
            cookieIcon.style.display = 'none';
            brownieIcon.style.display = 'none';
            bruleeIcon.style.display = 'none';
            paveIcon.style.display = 'none';
            snowballIcon.style.display = 'none';
            if (butterIcon) butterIcon.style.display = 'none';
            return;
        }

        cookieIcon.style.display = (currentIndex === 2) ? 'none' : '';
        brownieIcon.style.display = (currentIndex === 1) ? 'none' : '';
        bruleeIcon.style.display = (currentIndex === 3) ? 'none' : '';
        paveIcon.style.display = (currentIndex === 4) ? 'none' : '';
        snowballIcon.style.display = (currentIndex === 5) ? 'none' : '';
        if (butterIcon) butterIcon.style.display = (currentIndex === 6) ? 'none' : '';
    }

    clusterNames.forEach((name, idx) => {
        let x = 0, y = 0;
        
        // 초코브라우니는 정중앙 유지, 나머지 9개는 사방으로 랜덤 이격
        if (name !== "초코브라우니") {
            let isValid = false;
            let attempts = 0;
            while (!isValid && attempts < 300) {
                x = (Math.random() - 0.5) * 4000;
                y = (Math.random() - 0.5) * 4000;
                isValid = true;
                
                // 최소 거리 간격 규정 준수 (겹치지 않게 거리 800 이상 보장)
                for (let c of clustersData) {
                    let dx = c.x - x;
                    let dy = c.y - y;
                    if (Math.sqrt(dx * dx + dy * dy) < 800) {
                        isValid = false; 
                        break;
                    }
                }
                attempts++;
            }
        }
        clustersData.push({name, x, y});

        // 내부 컨테이너 구조 원본 완전 유지
        const container = document.createElement('div');
        container.classList.add('chip-container', 'cluster');
        container.dataset.name = name;
        container.dataset.index = idx + 1; // 순서 인덱스 부여
        container.dataset.baseX = x;
        container.dataset.baseY = y;
        
        container.style.transform = `translate(${x}px, ${y - 65}px) scale(${scale})`;

        const chipsCount = (name === "파베초콜릿") ? 15 : (name === "크림뷔렐레") ? 15 : (name === "스노우볼쿠키") ? 15 : (name === "버터쿠키") ? 15 : TOTAL_CHIPS;

        for (let i = 0; i < chipsCount; i++) {
            const chip = document.createElement('div');
            chip.classList.add('chip');
            
            const angleDeg = (i * 360 / chipsCount);
            const angleRad = angleDeg * (Math.PI / 180);
            
            chip.style.setProperty('--i', i);
            chip.style.setProperty('--rot', angleDeg + 'deg');
            
            // 【겹쳐진 순서】 1 위에 2, 2 위에 3 ... 18 위에 19
            const zExp = i;
            chip.dataset.zExp = zExp;
            chip.style.setProperty('--zExp', zExp);
            
            const inner = document.createElement('div');
            inner.classList.add('chip-inner');
            
            const suffix = (i === 0) ? '' : (i + 1);
            
            let frontImg = `${name}_F${suffix}.webp`;
            let backImg = `${name}_B${suffix}.webp`;

            if (name === "초코칩쿠키") {
                // 초코칩쿠키 클러스터는 이미지들이 전용 폴더 안에 있으므로 경로를 명시적으로 지정
                frontImg = `초코칩쿠키/초코칩쿠키_F${suffix}.webp`;
                backImg = `초코칩쿠키/초코칩쿠키_B${suffix}.webp`;
            } else if (name === "크림뷔렐레") {
                frontImg = `크림뷔렐레/크림뷔렐레_F${suffix}.webp`;
                backImg = `크림뷔렐레/Crème brûlée_B${suffix}.webp`;
            } else if (name === "파베초콜릿") {
                frontImg = `파베초콜릿/파베초콜릿_F${suffix}.webp`;
                backImg = `파베초콜릿/파베초콜릿_B${suffix}.webp`;
            } else if (name === "스노우볼쿠키") {
                const snowballSuffix = (i === 0) ? '' : (i + 1);
                frontImg = `스노우볼쿠키/스노우볼쿠키_F${snowballSuffix}.webp`;
                backImg = `스노우볼쿠키/스노우볼쿠키_B${snowballSuffix}.webp`;
            } else if (name === "버터쿠키") {
                frontImg = `버터쿠키/버터쿠키_F${suffix}.webp`;
                backImg = `버터쿠키/버터쿠키_B${suffix}.webp`;
            }

            const front = document.createElement('div');
            front.classList.add('front');
            if (name === "크림뷔렐레" && (i === 7 || i === 12 || i === 14)) {
                const frontVidEl = document.createElement('video');
                const vidSuffix = (i === 7) ? '8' : (i === 12) ? '13' : '15';
                frontVidEl.src = `크림뷔렐레/크림뷔렐레_F${vidSuffix}.mp4?v=${CACHE_VER}`;
                frontVidEl.loop = true;
                frontVidEl.muted = true;
                frontVidEl.playsInline = true;
                frontVidEl.preload = "none";
                frontVidEl.poster = `크림뷔렐레/크림뷔렐레_F${vidSuffix}.webp?v=${CACHE_VER}`; 
                /* 초기 재생 금지, expanded/popped 상태 트리거시 재생 */
                front.appendChild(frontVidEl);
            } else if (name === "스노우볼쿠키" && (i === 0 || i === 4 || i === 6 || i === 7 || i === 12)) {
                const frontVidEl = document.createElement('video');
                const vidSuffix = (i === 0) ? '' : (i + 1);
                frontVidEl.src = `스노우볼쿠키/스노우볼쿠키_F${vidSuffix}.mp4?v=${CACHE_VER}`;
                frontVidEl.loop = true;
                frontVidEl.muted = true;
                frontVidEl.playsInline = true;
                frontVidEl.preload = "none";
                frontVidEl.poster = `스노우볼쿠키/스노우볼쿠키_F${vidSuffix}.webp?v=${CACHE_VER}`;
                front.appendChild(frontVidEl);
            } else if (name === "버터쿠키" && (i === 1 || i === 2 || i === 5 || i === 6 || i === 8)) {
                const frontVidEl = document.createElement('video');
                const vidSuffix = i === 1 ? '2' : i === 2 ? '3' : i === 5 ? '6' : i === 6 ? '7' : '9';
                frontVidEl.src = `버터쿠키/버터쿠키_F${vidSuffix}.mp4?v=${CACHE_VER}`;
                frontVidEl.loop = true;
                frontVidEl.muted = true;
                frontVidEl.playsInline = true;
                frontVidEl.preload = "none";
                frontVidEl.poster = `버터쿠키/버터쿠키_F${vidSuffix}.webp?v=${CACHE_VER}`;
                front.appendChild(frontVidEl);
            } else {
                const frontImgEl = document.createElement('img');
                frontImgEl.decoding = 'async';
                frontImgEl.dataset.src = frontImg + '?v=' + CACHE_VER;
                frontImgEl.onerror = function() { this.style.display = 'none'; };
                front.appendChild(frontImgEl);
            }
            
            const back = document.createElement('div');
            back.classList.add('back');
            const backImgEl = document.createElement('img');
            backImgEl.decoding = 'async';
            // 뒷면은 실제로 뒤집힐 때 src를 할당 (lazy load)
            backImgEl.dataset.src = backImg + '?v=' + CACHE_VER;
            backImgEl.onerror = function() { this.style.display = 'none'; };
            back.appendChild(backImgEl);

            inner.appendChild(front);
            inner.appendChild(back);
            chip.appendChild(inner);
            container.appendChild(chip);
        }

        // 각 군집별 독립 생태계 (오픈, 확대, 플립 등의 상태 관리)
        let isExpanded = false;
        let isFlippedAll = false;
        let clickTimer = null;

        // 외부에서 클로저 변수를 초기화할 수 있도록 콜백 등록
        container._resetState = () => {
            isExpanded = false;
            isFlippedAll = false;
            clickTimer = null;
        };

        const chips = container.querySelectorAll('.chip');

        container.addEventListener('click', (e) => {
            if (globalPoppedChip) return;

            if (name === "초코칩쿠키") {
                document.querySelector('.main-title').textContent = 'Chocolate Chip Cookie';
                document.querySelector('.main-date').textContent = '2026.03.27';
            } else if (name === "초코브라우니") {
                document.querySelector('.main-title').textContent = 'Chocolate Brownie';
                document.querySelector('.main-date').textContent = '2026.03.29';
            } else if (name === "크림뷔렐레") {
                document.querySelector('.main-title').textContent = 'Cr\u00e8me Br\u00fbl\u00e9e';
                document.querySelector('.main-date').textContent = '2026.04.20';
            } else if (name === "파베초콜릿") {
                document.querySelector('.main-title').textContent = 'Pav\u00e9 Chocolate';
                document.querySelector('.main-date').textContent = '2026.04.16';
            } else if (name === "스노우볼쿠키") {
                document.querySelector('.main-title').textContent = 'Snowball Cookie';
                document.querySelector('.main-date').textContent = '2026.04.27';
            } else if (name === "버터쿠키") {
                document.querySelector('.main-title').textContent = 'Butter Cookie';
                document.querySelector('.main-date').textContent = '2026.05.03';
            }

            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }

            clickTimer = setTimeout(() => {
                if (!isExpanded) {
                    isExpanded = true;
                    container.classList.add('expanded');
                    // 확장 시 z-index 직접 적용
                    container.querySelectorAll('.chip').forEach(c => {
                        c.style.zIndex = c.dataset.zExp;
                    });
                    applyCircularClip(container);
                    // 펼친 상태에서 모든 앞면 비디오 재생
                    container.querySelectorAll('.front video').forEach(v => {
                        v.play().catch(() => {});
                    });
                } else {
                    isFlippedAll = !isFlippedAll;
                    if (isFlippedAll) {
                        container.classList.add('flipped-all');
                        chips.forEach(c => {
                            c.classList.add('flipped');
                            // 뒤집힐 때 뒷면 이미지 lazy load
                            const backImg = c.querySelector('.back img');
                            if (backImg && backImg.dataset.src && !backImg.getAttribute('src')) {
                                backImg.src = backImg.dataset.src;
                            }
                            // 뒷면을 보는 동안 앞면 비디오 정지(디코딩 부하 절감)
                            const fv = c.querySelector('.front video');
                            if (fv) fv.pause();
                        });
                    } else {
                        container.classList.remove('flipped-all');
                        chips.forEach(c => {
                            c.classList.remove('flipped');
                            // 다시 앞면이 보이면 비디오 재생
                            const fv = c.querySelector('.front video');
                            if (fv) fv.play().catch(() => {});
                        });
                    }
                }
                clickTimer = null;
            }, 220);
        });

        chips.forEach(chip => {
            chip.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (globalPoppedChip) return;

                if (isExpanded) {
                    if (clickTimer) clearTimeout(clickTimer);
                    clickTimer = null;
                    globalPoppedChip = chip;
                    container.classList.add('has-popped');
                    chip.classList.add('popped');
                    chip.style.clipPath = ''; // 팝업 시 잘려진 부분 복구
                    document.body.classList.add('chip-popped');
                    // 팝된 칩의 뒷면 이미지 미리 로드
                    const backImg = chip.querySelector('.back img');
                    if (backImg && backImg.dataset.src && !backImg.getAttribute('src')) {
                        backImg.src = backImg.dataset.src;
                    }
                    // 한 장 확대 시: 나머지 칩 비디오는 정지(디코딩 부하 절감), 확대된 칩만 재생
                    container.querySelectorAll('.front video').forEach(v => v.pause());
                    const poppedVid = chip.querySelector('.front video');
                    if (poppedVid) poppedVid.play().catch(() => {});
                    updateIconVisibility();
                }
            });

            chip.addEventListener('click', (e) => {
                if (!isExpanded) return;
                if (globalPoppedChip === chip) {
                    e.stopPropagation();
                    chip.classList.toggle('flipped');
                    // 뒤집힐 때 뒷면 이미지 lazy load
                    const backImg = chip.querySelector('.back img');
                    if (backImg && backImg.dataset.src && !backImg.getAttribute('src')) {
                        backImg.src = backImg.dataset.src;
                    }
                    // 앞면으로 돌아오면 비디오 재생, 뒤집히면 정지
                    const flipVid = chip.querySelector('.front video');
                    if (flipVid) {
                        if (chip.classList.contains('flipped')) flipVid.pause();
                        else flipVid.play().catch(() => {});
                    }
                }
            });
        });

        canvas.appendChild(container);
    });

    // --- 글로벌 바깥 클릭 해제 감지 ---
    document.body.addEventListener('click', (e) => {
        if (globalPoppedChip && !globalPoppedChip.contains(e.target)) {
            const container = globalPoppedChip.closest('.chip-container');
            const isFlippedAll = container.classList.contains('flipped-all');

            globalPoppedChip.classList.remove('popped');
            if (isFlippedAll) {
                globalPoppedChip.classList.add('flipped');
            } else {
                globalPoppedChip.classList.remove('flipped');
            }

            container.classList.remove('has-popped');
            applyCircularClip(container); // 복귀 시 다시 적용

            // 펼친 상태로 복귀: 뒤집힌 상태가 아니면 모든 앞면 비디오 재생 재개
            if (!isFlippedAll) {
                container.querySelectorAll('.front video').forEach(v => v.play().catch(() => {}));
            }

            globalPoppedChip = null;
            document.body.classList.remove('chip-popped');
            updateIconVisibility();
        }
    });

    // --- 방향키 네비게이션 전역 통합 ---
    document.addEventListener('keydown', (e) => {
        if (!globalPoppedChip) return;
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            const container = globalPoppedChip.closest('.chip-container');
            const chips = container.querySelectorAll('.chip');
            const chipsCount = chips.length;
            const isFlippedAll = container.classList.contains('flipped-all');
            
            const currentIdx = parseInt(globalPoppedChip.style.getPropertyValue('--i'));
            let nextIdx;
            if (e.key === 'ArrowRight') {
                nextIdx = (currentIdx + 1) % chipsCount;
            } else {
                nextIdx = (currentIdx - 1 + chipsCount) % chipsCount;
            }

            // 현재 칩 비디오 정지
            const prevVid = globalPoppedChip.querySelector('.front video');
            if (prevVid) { prevVid.pause(); prevVid.currentTime = 0; }

            globalPoppedChip.classList.remove('popped');
            if (isFlippedAll) globalPoppedChip.classList.add('flipped');
            else globalPoppedChip.classList.remove('flipped');

            const nextChip = chips[nextIdx];
            globalPoppedChip = nextChip;
            nextChip.classList.add('popped');
            nextChip.style.clipPath = ''; // 팝업 시 복구
            // 다음 칩의 뒷면 이미지 미리 로드
            const nextBack = nextChip.querySelector('.back img');
            if (nextBack && nextBack.dataset.src && !nextBack.getAttribute('src')) {
                nextBack.src = nextBack.dataset.src;
            }
            // 다음 칩 비디오 재생
            const nextVid = nextChip.querySelector('.front video');
            if (nextVid) nextVid.play().catch(() => {});
        }
    });

    window.showCluster = function(index) {
        currentIndex = index;

        // 해당 클러스터의 이미지를 처음 보여질 때만 로드 (lazy load)
        if (index > 0) {
            const activeContainer = document.querySelector(`.chip-container[data-index="${index}"]`);
            if (activeContainer) {
                activeContainer.querySelectorAll('img[data-src]').forEach(img => {
                    if (!img.getAttribute('src')) {
                        img.src = img.dataset.src;
                    }
                });
            }
        }

        // 아이콘 활성화 상태 업데이트
        if (cookieIcon) cookieIcon.classList.toggle('active', index === 2);
        if (brownieIcon) brownieIcon.classList.toggle('active', index === 1);
        if (bruleeIcon) bruleeIcon.classList.toggle('active', index === 3);
        if (paveIcon) paveIcon.classList.toggle('active', index === 4);
        if (snowballIcon) snowballIcon.classList.toggle('active', index === 5);
        if (butterIcon) butterIcon.classList.toggle('active', index === 6);

        document.querySelectorAll('.chip-container').forEach(cluster => {
            const i = Number(cluster.dataset.index);
            if (i !== index) {
                resetCluster(cluster);
            }
        });
        
        // 인덱스에 따라 타이틀 업데이트
        if (index === 0) {
            document.querySelector('.main-title').textContent = '';
            document.querySelector('.main-date').textContent = '';
        } else {
            const name = clusterNames[index - 1];
            if (name === "초코칩쿠키") {
                document.querySelector('.main-title').textContent = 'Chocolate Chip Cookie';
                document.querySelector('.main-date').textContent = '2026.03.27';
            } else if (name === "초코브라우니") {
                document.querySelector('.main-title').textContent = 'Chocolate Brownie';
                document.querySelector('.main-date').textContent = '2026.03.29';
            } else if (name === "크림뷔렐레") {
                document.querySelector('.main-title').textContent = 'Cr\u00e8me Br\u00fbl\u00e9e';
                document.querySelector('.main-date').textContent = '2026.04.20';
            } else if (name === "파베초콜릿") {
                document.querySelector('.main-title').textContent = 'Pav\u00e9 Chocolate';
                document.querySelector('.main-date').textContent = '2026.04.16';
            } else if (name === "스노우볼쿠키") {
                document.querySelector('.main-title').textContent = 'Snowball Cookie';
                document.querySelector('.main-date').textContent = '2026.04.27';
            } else if (name === "버터쿠키") {
                document.querySelector('.main-title').textContent = 'Butter Cookie';
                document.querySelector('.main-date').textContent = '2026.05.03';
            } else {
                document.querySelector('.main-title').textContent = 'Cluster ' + name;
                document.querySelector('.main-date').textContent = '';
            }
        }

        updateTransforms();
        updateIconVisibility();
    };

    const cookieIcon = document.querySelector('.floating-cookie');
    const brownieIcon = document.querySelector('.floating-brownie');
    const bruleeIcon = document.querySelector('.floating-brulee');
    const paveIcon = document.querySelector('.floating-pave');
    const snowballIcon = document.querySelector('.floating-snowball');
    const butterIcon = document.querySelector('.floating-butter');

    cookieIcon.addEventListener('click', () => {
        resetAllClusters();
        currentIndex = 2;
        direction = 1;
        showCluster(2);
    });

    brownieIcon.addEventListener('click', () => {
        resetAllClusters();
        currentIndex = 1;
        direction = -1;
        showCluster(1);
    });

    bruleeIcon.addEventListener('click', () => {
        resetAllClusters();
        currentIndex = 3;
        direction = 1;
        showCluster(3);
    });

    paveIcon.addEventListener('click', () => {
        resetAllClusters();
        currentIndex = 4;
        direction = 1;
        showCluster(4);
    });

    if (snowballIcon) {
        snowballIcon.addEventListener('click', () => {
            resetAllClusters();
            currentIndex = 5;
            direction = 1;
            showCluster(5);
        });
    }

    if (butterIcon) {
        butterIcon.addEventListener('click', () => {
            resetAllClusters();
            currentIndex = 6;
            direction = 1;
            showCluster(6);
        });
    }

    // ======== 로고 더블클릭으로 떠다니는 아이콘 토글 ======== //
    const mainLogo = document.querySelector('.main-logo');
    if (mainLogo) {
        mainLogo.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            iconsHidden = !iconsHidden;
            const allIcons = [cookieIcon, brownieIcon, bruleeIcon, paveIcon, snowballIcon, butterIcon];
            const typographyContainer = document.querySelector('.typography-container');
            if (iconsHidden) {
                allIcons.forEach(icon => { if (icon) icon.style.display = 'none'; });
                if (typographyContainer) typographyContainer.style.display = 'none';
            } else {
                updateIconVisibility();
                if (typographyContainer) typographyContainer.style.display = '';
            }
        });
    }

    // 첫 화면: 클러스터1 초기화 후 버튼1 소개문 팝업 표시
    setTimeout(() => {
        showCluster(0);
        if (introOverlay) {
            introOverlay.classList.add('active');
            document.body.classList.add('intro-active');
        }
    }, 0);

    // ======== 핵심: 무한 캔버스 패닝 로직 제거 (중앙 고정) ======== //

    // 소개문 팝업 상호 전환 로직
    const btn1 = document.getElementById('btn1');
    const btn2 = document.getElementById('btn2');
    const introOverlay = document.getElementById('introOverlay');
    const introOverlay2 = document.getElementById('introOverlay2');

    if (btn1 && introOverlay) {
        btn1.addEventListener('click', (e) => {
            e.stopPropagation();
            resetAllClusters();
            showCluster(0);
            if (introOverlay2) introOverlay2.classList.remove('active'); // 2번 닫기
            introOverlay.classList.add('active'); // 1번 열기
            document.body.classList.add('intro-active'); // 캔버스 숨김
        });

        introOverlay.addEventListener('click', () => {
            introOverlay.classList.remove('active');
            document.body.classList.remove('intro-active');
            updateIconVisibility();
        });
    }

    if (btn2 && introOverlay2) {
        btn2.addEventListener('click', (e) => {
            e.stopPropagation();
            resetAllClusters();
            showCluster(0);
            if (introOverlay) introOverlay.classList.remove('active'); // 1번 닫기
            introOverlay2.classList.add('active'); // 2번 열기
            document.body.classList.add('intro-active'); 
        });

        introOverlay2.addEventListener('click', () => {
            introOverlay2.classList.remove('active');
            document.body.classList.remove('intro-active');
        });
    }
});
