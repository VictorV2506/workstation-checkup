// desk-modal.js
// Desk inspection modal: open, close, save
// Depends on globals: desksData, currentFloor, currentUser, db, selectedDesks
// Calls: renderFloorPlan(), updateStats(), updateDashboard(), clearSelection()

        function openDeskModal(deskId) {
            const modal = document.getElementById('deskModal');
            const modalTitle = document.getElementById('modalTitle');
            const modalBody = document.getElementById('modalBody');
            const deskData = desksData[deskId] || {};
            const desk = currentFloor.desks.find(d => d.id === deskId);
            
            modalTitle.textContent = `Inspecting: ${desk?.number || deskId}`;
            
            modalBody.innerHTML = `
                <input type="hidden" id="currentDeskId" value="${deskId}">
                
                <!-- Equipment Checklist -->
                <div class="checklist-section">
                    <h3>⚡ Equipment Checklist</h3>
                    <div class="checkbox-grid">
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkPower" ${deskData.checkPower ? 'checked' : ''}>
                            <label for="checkPower">Power</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkLAN" ${deskData.checkLAN ? 'checked' : ''}>
                            <label for="checkLAN">LAN</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkMon1" ${deskData.checkMon1 ? 'checked' : ''}>
                            <label for="checkMon1">Mon 1</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkMon2" ${deskData.checkMon2 ? 'checked' : ''}>
                            <label for="checkMon2">Mon 2</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkPTT" ${deskData.checkPTT ? 'checked' : ''}>
                            <label for="checkPTT">PTT</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkKeyboard" ${deskData.checkKeyboard ? 'checked' : ''}>
                            <label for="checkKeyboard">Keyboard</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkDocking" ${deskData.checkDocking ? 'checked' : ''}>
                            <label for="checkDocking">Docking</label>
                        </div>
                        <div class="checkbox-item">
                            <input type="checkbox" id="checkMouse" ${deskData.checkMouse ? 'checked' : ''}>
                            <label for="checkMouse">Mouse</label>
                        </div>
                    </div>
                </div>
                
                <!-- Equipment Details -->
                <div class="checklist-section">
                    <h3>📋 Equipment Details</h3>
                    <div class="form-group">
                        <label>Left Screen</label>
                        <input type="text" id="deskLeftScreen" value="${deskData.leftScreen || ''}" 
                               placeholder="e.g., Dell P2422H (Black)">
                    </div>
                    <div class="form-group">
                        <label>Dock</label>
                        <input type="text" id="deskDock" value="${deskData.dock || ''}" 
                               placeholder="e.g., Dock integrated in Dell Monitor">
                    </div>
                    <div class="form-group">
                        <label>Right Screen</label>
                        <input type="text" id="deskRightScreen" value="${deskData.rightScreen || ''}" 
                               placeholder="e.g., Dell P2422HE (Black)">
                    </div>
                </div>
                
                <!-- Status & Notes -->
                <div class="checklist-section">
                    <h3>📝 Status & Notes</h3>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="deskStatus">
                            <option value="pending" ${!deskData.status || deskData.status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="inspected" ${deskData.status === 'inspected' ? 'selected' : ''}>✅ OK - No Issues</option>
                            <option value="issue" ${deskData.status === 'issue' ? 'selected' : ''}>❌ Issue Found</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Remarks</label>
                        <textarea id="deskRemarks" placeholder="Add any observations, issues, or notes...">${deskData.remarks || ''}</textarea>
                    </div>
                </div>
            `;
            
            modal.style.display = 'block';
        }

        function closeModal() {
            document.getElementById('deskModal').style.display = 'none';
        }

        function saveDeskData() {
            const deskId = document.getElementById('currentDeskId')?.value;
            
            if (!deskId) {
                // Bulk edit mode
                const bulkData = {
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: currentUser.email
                };
                
                const leftScreen = document.getElementById('bulkLeftScreen')?.value;
                const dock = document.getElementById('bulkDock')?.value;
                const rightScreen = document.getElementById('bulkRightScreen')?.value;
                const remarks = document.getElementById('bulkRemarks')?.value;
                
                if (leftScreen) bulkData.leftScreen = leftScreen;
                if (dock) bulkData.dock = dock;
                if (rightScreen) bulkData.rightScreen = rightScreen;
                if (remarks) bulkData.remarks = remarks;
                
                const batch = db.batch();
                selectedDesks.forEach(id => {
                    const deskRef = db.collection('desks').doc(id);
                    batch.set(deskRef, bulkData, { merge: true });
                    desksData[id] = { ...desksData[id], ...bulkData };
                });
                
                batch.commit().then(() => {
                    console.log('✅ Bulk updated');
                    closeModal();
                    renderFloorPlan();
                    updateStats();
                    clearSelection();
                }).catch(error => {
                    alert('Error: ' + error.message);
                });
            } else {
                // Single desk edit with checklist
                const data = {
                    status: document.getElementById('deskStatus').value,
                    leftScreen: document.getElementById('deskLeftScreen').value,
                    dock: document.getElementById('deskDock').value,
                    rightScreen: document.getElementById('deskRightScreen').value,
                    remarks: document.getElementById('deskRemarks').value,
                    checkPower: document.getElementById('checkPower').checked,
                    checkLAN: document.getElementById('checkLAN').checked,
                    checkMon1: document.getElementById('checkMon1').checked,
                    checkMon2: document.getElementById('checkMon2').checked,
                    checkPTT: document.getElementById('checkPTT').checked,
                    checkKeyboard: document.getElementById('checkKeyboard').checked,
                    checkDocking: document.getElementById('checkDocking').checked,
                    checkMouse: document.getElementById('checkMouse').checked,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: currentUser.email
                };
                
                db.collection('desks').doc(deskId).set(data, { merge: true })
                    .then(() => {
                        desksData[deskId] = data;
                        console.log('✅ Saved desk');
                        closeModal();
                        renderFloorPlan();
                        updateStats();
                        updateDashboard();
                    })
                    .catch(error => {
                        alert('Error: ' + error.message);
                    });
            }
        }


        window.onclick = function(event) {
            const modal = document.getElementById('deskModal');
            if (event.target === modal) {
                closeModal();
            }
        }
