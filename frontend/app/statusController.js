// Manage user-facing status messaging and mini status indicator text.
function createStatusController({ dom, state, issuesController }) {
    let statusTimeout = null;

    function setStatus(message) {
        if (dom.statusBubble) {
            dom.statusBubble.textContent = message || "";
            dom.statusBubble.style.opacity = message ? "1" : "0";
            if (statusTimeout) clearTimeout(statusTimeout);
            if (message) {
                statusTimeout = setTimeout(() => {
                    dom.statusBubble.style.opacity = "0";
                    statusTimeout = null;
                }, 5000);
            }
        }
    }

    function updateMiniStatus() {
        if (!dom.miniStatus) return;
        if (!state.summary) {
            dom.miniStatus.classList.add("hidden");
            dom.miniStatus.textContent = "";
            return;
        }
        const highlightText = state.highlightEnabled ? "Highlights ON" : "Highlights OFF";
        const modeText = state.mode === "all" ? "Mode ALL" : "Mode STEP";
        let itemText = "Item –";
        const selectedIssue = issuesController.getSelectedIssue();
        if (selectedIssue) {
            const { items } = issuesController.getIssueItems(selectedIssue);
            const total = items.length;
            if (state.mode === "all") {
                itemText = total ? `Item All (${total})` : "Item All";
            } else if (total) {
                const safeIndex = ((state.itemIndex % total) + total) % total;
                itemText = `Item ${safeIndex + 1} / ${total}`;
            }
        }
        dom.miniStatus.textContent = `${highlightText} • ${modeText} • ${itemText}`;
        dom.miniStatus.classList.toggle("hidden", false);
    }

    return {
        setStatus,
        updateMiniStatus,
    };
}

export { createStatusController };
