// map-interactions.js
// Drag-to-select (bulk mode), pinch/ctrl+wheel zoom, touch zoom
// Depends on globals: selectedDesks, bulkEditBtn state, currentZoom
// Calls: zoomIn(), zoomOut(), applyZoom()

// ============================================================
// SIMPLE DRAG-TO-SELECT - HOLD CLICK + HOVER OVER DESKS
// ============================================================

let isMouseDown = false;

function initSimpleDragSelect() {
  console.log('🎯 Initializing simple drag-to-select...');
  
  // Wait for elements to exist
  const waitForElements = setInterval(() => {
    const floorPlan = document.getElementById('floorPlan');
    const bulkBtn = document.getElementById('bulkEditBtn');
    
    if (floorPlan && bulkBtn) {
      clearInterval(waitForElements);
      console.log('✅ Elements found, setting up drag-select...');
      
      // Mouse down anywhere on floor plan
      floorPlan.addEventListener('mousedown', (e) => {
        // Check if bulk edit button has orange background (is active)
        const isBulkMode = bulkBtn.style.background.includes('rgb(245, 158, 11)') || 
                           bulkBtn.style.background.includes('#f59e0b');
        
        console.log('🖱️ Mouse down, Bulk mode active:', isBulkMode);
        
        if (isBulkMode) {
          isMouseDown = true;
          e.preventDefault();
          console.log('✅ Started drag selection');
        }
      });
      
      // Mouse move - select desks
      floorPlan.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        
        const element = document.elementFromPoint(e.clientX, e.clientY);
        
        if (element && element.classList.contains('desk-marker')) {
          const deskId = element.dataset.deskId;
          
          // Check if selectedDesks exists
          if (typeof selectedDesks !== 'undefined' && deskId) {
            if (!selectedDesks.has(deskId)) {
              console.log('✅ Selecting:', deskId);
              
              selectedDesks.add(deskId);
              element.classList.add('selected');
              
              // Visual feedback
              element.style.transform = 'translate(-50%, -50%) scale(1.3)';
              setTimeout(() => {
                element.style.transform = '';
              }, 200);
              
              // Update counter
              const info = document.getElementById('bulkInfo');
              if (info) {
                info.textContent = selectedDesks.size + ' desks selected';
              }
            }
          }
        }
      });
      
      // Mouse up anywhere
      document.addEventListener('mouseup', () => {
        if (isMouseDown) {
          console.log('🛑 Stopped drag selection');
          isMouseDown = false;
        }
      });
      
      console.log('✅ Simple drag-to-select ready!');
      console.log('💡 To use: Enable Bulk Edit Mode, then click and drag!');
    }
  }, 500);
}

// ============================================================
// PINCH-TO-ZOOM (Ctrl+Wheel)
// ============================================================

function initPinchZoom() {
  console.log('🔍 Initializing pinch-to-zoom...');
  
  const waitForViewer = setInterval(() => {
    const viewer = document.getElementById('floorViewer');
    
    if (viewer) {
      clearInterval(waitForViewer);
      
      viewer.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          
          // Check if zoom functions exist
          if (typeof zoomIn === 'function' && typeof zoomOut === 'function') {
            if (e.deltaY < 0) {
              zoomIn();
              console.log('🔍 Zoom in');
            } else {
              zoomOut();
              console.log('🔍 Zoom out');
            }
          }
        }
      }, { passive: false });
      
      // Touch pinch
      let lastDist = 0;
      
      viewer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          lastDist = Math.sqrt(dx * dx + dy * dy);
        }
      });
      
      viewer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
          e.preventDefault();
          
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (Math.abs(dist - lastDist) > 5) {
            if (typeof currentZoom !== 'undefined' && typeof applyZoom === 'function') {
              currentZoom += (dist - lastDist) * 0.005;
              currentZoom = Math.max(0.5, Math.min(3, currentZoom));
              applyZoom();
            }
            lastDist = dist;
          }
        }
      }, { passive: false });
      
      console.log('✅ Pinch-to-zoom ready!');
    }
  }, 500);
}

// Start both features
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSimpleDragSelect();
    initPinchZoom();
  


});
} else {
  initSimpleDragSelect();
  initPinchZoom();
}

// ============================================================
// END FEATURES
// ============================================================
