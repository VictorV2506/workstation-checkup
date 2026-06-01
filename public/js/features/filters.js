// Module: Desk Filters
// Depends on: desksData, currentFilter (globals)

function filterDesks(filterType) {
        currentFilter = filterType;
        
        document.querySelectorAll('.stat-item').forEach(item => {
            item.classList.remove('active-filter');
        });
        document.querySelector(`[data-filter="${filterType}"]`)?.classList.add('active-filter');
        
        applyCurrentFilter();
    }

function applyCurrentFilter() {
        const markers = document.querySelectorAll('.desk-marker');
        
        markers.forEach(marker => {
            marker.classList.remove('highlighted', 'dimmed');
            const deskId = marker.dataset.deskId;
            const deskData = desksData[deskId];
            
            let shouldHighlight = false;
            
            switch(currentFilter) {
                case 'all':
                    shouldHighlight = true;
                    break;
                case 'inspected':
                    shouldHighlight = deskData?.status === 'inspected';
                    break;
                case 'issue':
                    shouldHighlight = deskData?.status === 'issue';
                    break;
                case 'pending':
                    shouldHighlight = !deskData?.status || deskData.status === 'pending';
                    break;
            }
            
            if (shouldHighlight) {
                marker.classList.add('highlighted');
            } else {
                marker.classList.add('dimmed');
            }
        });
    }
