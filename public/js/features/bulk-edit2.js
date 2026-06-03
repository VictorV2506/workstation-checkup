// bulk-edit.js
// Bulk selection, bulk edit modal, drag-to-select
// Depends on globals: bulkModeActive, bulkEditMode, selectedDesks, desksData, currentUser, db
// Calls: renderFloorPlan(), updateStats(), closeModal()

        // Bulk Selection
        function toggleBulkMode() {
            bulkModeActive = !bulkModeActive;
            const btn = document.getElementById('bulkModeBtn');
            const bulkBar = document.getElementById('bulkActionsBar');
            
            if (bulkModeActive) {
                btn.textContent = '❌ Exit Bulk Mode';
                btn.style.background = '#f43f5e';
                bulkBar.classList.add('active');
            } else {
                btn.textContent = '✏️ Bulk Edit Mode';
                btn.style.background = '';
                bulkBar.classList.remove('active');
                clearSelection();
            }
        }

        function toggleDeskSelection(deskId) {
            const marker = document.querySelector(`[data-desk-id="${deskId}"]`);
            if (selectedDesks.has(deskId)) {
                selectedDesks.delete(deskId);
                marker.classList.remove('selected');
            } else {
                selectedDesks.add(deskId);
                marker.classList.add('selected');
            }
            updateSelectedCount();
        }

        function clearSelection() {
            selectedDesks.clear();
            document.querySelectorAll('.desk-marker.selected').forEach(marker => {
                marker.classList.remove('selected');
            });
            updateSelectedCount();
        }

        function updateSelectedCount() {
            document.getElementById('selectedCount').textContent = selectedDesks.size;
        }

        // Drag Selection
        // Coordinates divided by currentZoom: selectionBox is a child of the
        // scaled #floorPlan element, so unscaled space coords are required.
        function setupDragSelection() {
            const floorPlan = document.getElementById('floorPlan');

            // GUARD: event listeners live on the floorPlan element itself,
            // not its children, so they survive innerHTML clears.
            // Without this guard, every renderFloorPlan() call stacks a new
            // set of mousedown/mousemove listeners — one drag then creates N
            // selection boxes simultaneously (one per stacked listener).
            if (floorPlan.dataset.dragSelectReady) { return; }
            floorPlan.dataset.dragSelectReady = 'true';

            let selectionBox = null;

            floorPlan.addEventListener('mousedown', (e) => {
                if (!bulkModeActive || e.target.classList.contains('desk-marker')) return;
                
                isDragging = true;
                const rect = floorPlan.getBoundingClientRect();
                selectionStart = { 
                    x: (e.clientX - rect.left) / currentZoom, 
                    y: (e.clientY - rect.top)  / currentZoom 
                };
                
                selectionBox = document.createElement('div');
                selectionBox.className = 'selection-box';
                selectionBox.style.left = selectionStart.x + 'px';
                selectionBox.style.top = selectionStart.y + 'px';
                floorPlan.appendChild(selectionBox);
            });

            floorPlan.addEventListener('mousemove', (e) => {
                if (!isDragging || !selectionBox) return;
                
                const rect = floorPlan.getBoundingClientRect();
                const currentX = (e.clientX - rect.left) / currentZoom;
                const currentY = (e.clientY - rect.top)  / currentZoom;
                const width = Math.abs(currentX - selectionStart.x);
                const height = Math.abs(currentY - selectionStart.y);
                const left = Math.min(currentX, selectionStart.x);
                const top = Math.min(currentY, selectionStart.y);
                
                selectionBox.style.width = width + 'px';
                selectionBox.style.height = height + 'px';
                selectionBox.style.left = left + 'px';
                selectionBox.style.top = top + 'px';
            });

            // mouseup on document — fires even when mouse is released
            // outside the floor plan boundary (floorPlan.mouseup would miss it).
            document.addEventListener('mouseup', (e) => {
                if (!isDragging) return;
                
                if (selectionBox) {
                    const rect = selectionBox.getBoundingClientRect();
                    
                    document.querySelectorAll('.desk-marker').forEach(marker => {
                        const markerRect = marker.getBoundingClientRect();
                        const markerCenterX = markerRect.left + markerRect.width / 2;
                        const markerCenterY = markerRect.top + markerRect.height / 2;
                        
                        if (markerCenterX >= rect.left && markerCenterX <= rect.right &&
                            markerCenterY >= rect.top && markerCenterY <= rect.bottom) {
                            const deskId = marker.dataset.deskId;
                            if (!selectedDesks.has(deskId)) {
                                toggleDeskSelection(deskId);
                            }
                        }
                    });
                    
                    selectionBox.remove();
                    selectionBox = null;
                }
                
                isDragging = false;
                selectionStart = null;
            });
        }

        // Bulk Actions
        function markSelectedAs(status) {
            if (selectedDesks.size === 0) {
                alert('No desks selected');
                return;
            }
            
            const batch = db.batch();
            selectedDesks.forEach(deskId => {
                const deskRef = db.collection('desks').doc(deskId);
                batch.set(deskRef, {
                    status: status,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: currentUser.email
                }, { merge: true });
                
                desksData[deskId] = { ...desksData[deskId], status };
            });
            
            batch.commit().then(() => {
                console.log('✅ Updated', selectedDesks.size, 'desks');
                renderFloorPlan();
                updateStats();
                updateDashboard();
                clearSelection();
            }).catch(error => {
                alert('Error: ' + error.message);
            });
        }

        function openBulkEditModal() {
            if (selectedDesks.size === 0) {
                alert('No desks selected');
                return;
            }
            
            const modal = document.getElementById('deskModal');
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');
            
            modalTitle.textContent = `Bulk Edit ${selectedDesks.size} Desks`;
            
            modalBody.innerHTML = `
                <!-- Equipment Checklist -->
                <div class="checklist-section">
                    <div class="bulk-check-header">
                        <h3>&#9889; Equipment Checklist</h3>
                        <label class="bulk-check-toggle">
                            <input type="checkbox" id="bulkApplyChecks" onchange="toggleBulkCheckboxes(this.checked)">
                            <span class="bulk-check-toggle-label">Apply to all selected desks</span>
                        </label>
                    </div>
                    <p class="bulk-check-hint">Enable the toggle above to set equipment state for all selected desks.</p>
                    <div class="checkbox-grid bulk-checks-disabled" id="bulkCheckGrid">
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckPower"    disabled><label for="bulkCheckPower">Power</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckLAN"      disabled><label for="bulkCheckLAN">LAN</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckMon1"     disabled><label for="bulkCheckMon1">Mon 1</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckMon2"     disabled><label for="bulkCheckMon2">Mon 2</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckTBT"      disabled><label for="bulkCheckTBT">TBT</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckKeyboard" disabled><label for="bulkCheckKeyboard">Keyboard</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckDocking"  disabled><label for="bulkCheckDocking">Docking</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="bulkCheckMouse"    disabled><label for="bulkCheckMouse">Mouse</label>
                        </div>
                    </div>
                </div>

                <!-- Equipment Details -->
                <div class="checklist-section">
                    <h3>&#128203; Equipment Details</h3>
                    <div class="form-group">
                        <label>Left Screen</label>
                        <select id="bulkLeftScreen">
                            <option value="">-- No Change --</option>
                            ${monitorModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Dock</label>
                        <select id="bulkDock">
                            <option value="">-- No Change --</option>
                            ${dockingStations.map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Right Screen</label>
                        <select id="bulkRightScreen">
                            <option value="">-- No Change --</option>
                            ${monitorModels.map(m => `<option value="${m}">${m}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <!-- Status & Notes -->
                <div class="checklist-section">
                    <h3>&#128221; Status &amp; Notes</h3>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="bulkStatus">
                            <option value="">-- No Change --</option>
                            <option value="pending">Pending</option>
                            <option value="inspected">&#9989; OK - No Issues</option>
                            <option value="issue">&#10060; Issue Found</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Remarks</label>
                        <textarea id="bulkRemarks" placeholder="Add remarks for all selected desks..."></textarea>
                    </div>
                </div>
            `;
            
            modal.style.display = 'block';
        }


        // Enable/disable bulk checklist when toggle is switched
        function toggleBulkCheckboxes(enabled) {
            var grid = document.getElementById('bulkCheckGrid');
            if (!grid) { return; }
            grid.classList.toggle('bulk-checks-disabled', !enabled);
            grid.querySelectorAll('input[type="checkbox"]').forEach(function(cb) {
                cb.disabled = !enabled;
            });
            var hint = grid.previousElementSibling;
            if (hint && hint.classList.contains('bulk-check-hint')) {
                hint.style.display = enabled ? 'none' : '';
            }
        }

        // Save All (bulk context)
        function saveAll() {
            alert('All changes are automatically saved! ✅');
        }

        // ========================================
        // BULK EDIT MODE FUNCTIONS
        // ========================================
        function toggleBulkEdit() {
            bulkEditMode = !bulkEditMode;
            const btn = document.getElementById('bulkEditBtn');
            const bar = document.getElementById('bulkActionsBar');
            
            console.log('🔄 Bulk edit mode toggled to:', bulkEditMode);
            
            if (bulkEditMode) {
                btn.style.backgroundColor = '#ff6b35';
                btn.style.color = 'white';
                bar.style.display = 'flex';
                initializeDragToSelect();
            } else {
                btn.style.backgroundColor = '';
                btn.style.color = '';
                bar.style.display = 'none';
                clearBulkSelection();
                removeDragToSelect();
            }
        }
        
        function clearBulkSelection() {
            selectedDesks.clear();
            updateBulkCounter();
            
            document.querySelectorAll('.desk-cell.selected').forEach(desk => {
                desk.classList.remove('selected');
            });
        }
        
        function updateBulkCounter() {
            const counter = document.getElementById('selectedCount');
            if (counter) {
                const count = selectedDesks.size;
                counter.textContent = count === 1 ? '1 desk selected' : `${count} desks selected`;
            }
        }
        
        function initializeDragToSelect() {
            const floorPlan = document.getElementById('floorPlanContainer');
            if (!floorPlan) {
                console.error('❌ Floor plan container not found');
                return;
            }
            
            console.log('✅ Initializing drag-to-select');
            
            floorPlan.addEventListener('mousedown', handleBulkDragStart);
            document.addEventListener('mousemove', handleBulkDragMove);
            document.addEventListener('mouseup', handleBulkDragEnd);
            
            floorPlan.addEventListener('touchstart', handleBulkTouchStart, {passive: false});
            document.addEventListener('touchmove', handleBulkTouchMove, {passive: false});
            document.addEventListener('touchend', handleBulkDragEnd);
        }
        
        function removeDragToSelect() {
            const floorPlan = document.getElementById('floorPlanContainer');
            if (!floorPlan) return;
            
            floorPlan.removeEventListener('mousedown', handleBulkDragStart);
            document.removeEventListener('mousemove', handleBulkDragMove);
            document.removeEventListener('mouseup', handleBulkDragEnd);
            
            floorPlan.removeEventListener('touchstart', handleBulkTouchStart);
            document.removeEventListener('touchmove', handleBulkTouchMove);
            document.removeEventListener('touchend', handleBulkDragEnd);
        }
        
        function handleBulkDragStart(e) {
            if (!bulkEditMode) return;
            
            const target = e.target.closest('.desk-cell');
            if (!target) return;
            
            e.preventDefault();
            isMouseDown = true;
            isDragging = false;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            
            console.log('🖱️ Mouse down on desk');
            toggleDeskInBulk(target);
        }
        
        function handleBulkTouchStart(e) {
            if (!bulkEditMode) return;
            
            const target = e.target.closest('.desk-cell');
            if (!target) return;
            
            e.preventDefault();
            const touch = e.touches[0];
            isMouseDown = true;
            isDragging = false;
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            
            toggleDeskInBulk(target);
        }
        
        function handleBulkDragMove(e) {
            if (!bulkEditMode || !isMouseDown) return;
            
            const deltaX = Math.abs(e.clientX - dragStartX);
            const deltaY = Math.abs(e.clientY - dragStartY);
            
            if (!isDragging && (deltaX > 5 || deltaY > 5)) {
                isDragging = true;
                console.log('✅ Started drag selection');
            }
            
            if (isDragging) {
                const target = e.target.closest('.desk-cell');
                if (target && !target.classList.contains('selected')) {
                    selectDeskInBulk(target);
                }
            }
        }
        
        function handleBulkTouchMove(e) {
            if (!bulkEditMode || !isMouseDown) return;
            
            e.preventDefault();
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - dragStartX);
            const deltaY = Math.abs(touch.clientY - dragStartY);
            
            if (!isDragging && (deltaX > 5 || deltaY > 5)) {
                isDragging = true;
            }
            
            if (isDragging) {
                const element = document.elementFromPoint(touch.clientX, touch.clientY);
                const target = element?.closest('.desk-cell');
                if (target && !target.classList.contains('selected')) {
                    selectDeskInBulk(target);
                }
            }
        }
        
        function handleBulkDragEnd() {
            if (isDragging) {
                console.log('🛑 Stopped drag selection');
            }
            isMouseDown = false;
            isDragging = false;
        }
        
        function toggleDeskInBulk(deskElement) {
            const deskId = deskElement.dataset.deskId;
            if (!deskId) return;
            
            if (selectedDesks.has(deskId)) {
                deselectDeskInBulk(deskElement);
            } else {
                selectDeskInBulk(deskElement);
            }
        }
        
        function selectDeskInBulk(deskElement) {
            const deskId = deskElement.dataset.deskId;
            if (!deskId) return;
            
            selectedDesks.add(deskId);
            deskElement.classList.add('selected');
            updateBulkCounter();
            console.log('✅ Selected:', deskId);
        }
        
        function deselectDeskInBulk(deskElement) {
            const deskId = deskElement.dataset.deskId;
            if (!deskId) return;
            
            selectedDesks.delete(deskId);
            deskElement.classList.remove('selected');
            updateBulkCounter();
            console.log('➖ Deselected:', deskId);
        }
