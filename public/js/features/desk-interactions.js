// desk-interactions.js
// Handles desk marker click routing: bulk mode vs inspection modal
// Depends on globals: bulkModeActive
// Calls: toggleDeskSelection(), openInspectionModal()

        // Desk Click Handler
        function handleDeskClick(e, deskId) {
            if (bulkModeActive) {
                e.stopPropagation();
                toggleDeskSelection(deskId);
            } else {
                openInspectionModal(deskId);
            }
        }

