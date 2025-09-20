// Undo/Redo management - handles state history for cards and content changes
class UndoRedoManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = 50;
        this.isPerformingUndoRedo = false;
        
        // Debouncing for content changes
        this.contentChangeTimeout = null;
        this.contentChangeDelay = 1000; // ms
        
        // Pending operations to batch
        this.pendingDragOperation = null;
    }
    
    // Save the current state to history
    saveState(operation, data = {}) {
        // Don't save states during undo/redo operations
        if (this.isPerformingUndoRedo) {
            return;
        }
        
        // Get current application state
        const currentState = this.captureCurrentState();
        
        // Create history entry
        const historyEntry = {
            operation: operation,
            timestamp: Date.now(),
            state: currentState,
            data: data
        };
        
        // Remove any future history if we're not at the end
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }
        
        // Add new state
        this.history.push(historyEntry);
        this.currentIndex++;
        
        // Limit history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.currentIndex--;
        }
        
        console.log(`Saved ${operation} state (${this.history.length} total)`);
    }
    
    // Save state specifically for drag operations (with batching)
    saveDragState(operation, cardIds, startPositions) {
        if (this.isPerformingUndoRedo) return;
        
        this.pendingDragOperation = {
            operation: operation,
            cardIds: cardIds,
            startPositions: startPositions,
            timestamp: Date.now()
        };
    }
    
    // Finish a drag operation and save the final state
    finishDragOperation() {
        if (this.pendingDragOperation && !this.isPerformingUndoRedo) {
            // Get final positions
            const finalPositions = {};
            this.pendingDragOperation.cardIds.forEach(cardId => {
                const card = window.cardManager.cards.get(cardId);
                if (card) {
                    finalPositions[cardId] = { x: card.x, y: card.y };
                }
            });
            
            // Only save if positions actually changed
            let hasChanged = false;
            for (const cardId of this.pendingDragOperation.cardIds) {
                const start = this.pendingDragOperation.startPositions[cardId];
                const final = finalPositions[cardId];
                if (start && final && (start.x !== final.x || start.y !== final.y)) {
                    hasChanged = true;
                    break;
                }
            }
            
            if (hasChanged) {
                this.saveState(this.pendingDragOperation.operation, {
                    cardIds: this.pendingDragOperation.cardIds,
                    startPositions: this.pendingDragOperation.startPositions,
                    finalPositions: finalPositions
                });
            }
            
            this.pendingDragOperation = null;
        }
    }
    
    // Save state for content changes (with debouncing)
    saveContentState(cardId, oldContent, newContent) {
        if (this.isPerformingUndoRedo) return;
        
        // Clear existing timeout
        if (this.contentChangeTimeout) {
            clearTimeout(this.contentChangeTimeout);
        }
        
        // Debounce content changes
        this.contentChangeTimeout = setTimeout(() => {
            // Only save if content actually changed
            if (oldContent !== newContent) {
                this.saveState('content_change', {
                    cardId: cardId,
                    oldContent: oldContent,
                    newContent: newContent
                });
            }
            this.contentChangeTimeout = null;
        }, this.contentChangeDelay);
    }
    
    // Capture the current state of all cards
    captureCurrentState() {
        const cards = {};
        if (window.cardManager) {
            window.cardManager.cards.forEach((cardData, cardId) => {
                cards[cardId] = {
                    id: cardData.id,
                    x: cardData.x,
                    y: cardData.y,
                    width: cardData.width,
                    height: cardData.height,
                    content: cardData.content
                };
            });
        }
        
        return {
            cards: cards,
            selectedCards: window.cardManager ? Array.from(window.cardManager.selectedCards) : [],
            activeCard: window.cardManager ? window.cardManager.activeCard : null
        };
    }
    
    // Apply a state to the application
    applyState(state) {
        this.isPerformingUndoRedo = true;
        
        try {
            if (!window.cardManager || !state) {
                return;
            }
            
            // Clear current cards
            window.cardManager.cards.clear();
            window.cardManager.selectedCards.clear();
            window.cardManager.world.world.querySelectorAll('.card').forEach(card => card.remove());
            
            // Recreate cards from state
            Object.values(state.cards).forEach(cardData => {
                window.cardManager.createCard(cardData);
            });
            
            // Restore selection state
            window.cardManager.selectedCards.clear();
            if (state.selectedCards) {
                state.selectedCards.forEach(cardId => {
                    window.cardManager.selectedCards.add(cardId);
                    const element = window.cardManager.world.world.querySelector(`[data-card-id="${cardId}"]`);
                    if (element) {
                        element.classList.add('selected');
                    }
                });
            }
            
            // Restore active card
            if (state.activeCard && window.cardManager.cards.has(state.activeCard)) {
                window.cardManager.activeCard = state.activeCard;
                const element = window.cardManager.world.world.querySelector(`[data-card-id="${state.activeCard}"]`);
                if (element) {
                    element.classList.add('active', 'selected');
                }
                
                // Update sidebar if open
                if (window.sidebar && window.sidebar.isOpen) {
                    const cardData = window.cardManager.cards.get(state.activeCard);
                    window.sidebar.populateForm(cardData);
                }
            } else {
                window.cardManager.activeCard = null;
                if (window.sidebar) {
                    window.sidebar.close();
                }
            }
            
            // Save the restored state
            if (window.storage) {
                window.storage.saveCards(Array.from(window.cardManager.cards.values()));
            }
            
        } finally {
            this.isPerformingUndoRedo = false;
        }
    }
    
    // Perform undo operation
    undo() {
        if (!this.canUndo()) {
            console.log('Cannot undo: no previous state');
            return false;
        }
        
        this.currentIndex--;
        const stateToRestore = this.history[this.currentIndex];
        
        console.log(`Undoing: ${stateToRestore.operation}`);
        this.applyState(stateToRestore.state);
        
        return true;
    }
    
    // Perform redo operation
    redo() {
        if (!this.canRedo()) {
            console.log('Cannot redo: no future state');
            return false;
        }
        
        this.currentIndex++;
        const stateToRestore = this.history[this.currentIndex];
        
        console.log(`Redoing: ${stateToRestore.operation}`);
        this.applyState(stateToRestore.state);
        
        return true;
    }
    
    // Check if undo is available
    canUndo() {
        return this.currentIndex > 0;
    }
    
    // Check if redo is available
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }
    
    // Get the current operation that would be undone
    getUndoOperation() {
        if (!this.canUndo()) return null;
        return this.history[this.currentIndex].operation;
    }
    
    // Get the current operation that would be redone
    getRedoOperation() {
        if (!this.canRedo()) return null;
        return this.history[this.currentIndex + 1].operation;
    }
    
    // Clear history
    clearHistory() {
        this.history = [];
        this.currentIndex = -1;
        this.pendingDragOperation = null;
        if (this.contentChangeTimeout) {
            clearTimeout(this.contentChangeTimeout);
            this.contentChangeTimeout = null;
        }
        console.log('Undo history cleared');
    }
    
    // Initialize with current state
    initialize() {
        // Save initial state
        this.saveState('initial_state');
    }
    
    // Get history statistics
    getStats() {
        return {
            historySize: this.history.length,
            currentIndex: this.currentIndex,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            undoOperation: this.getUndoOperation(),
            redoOperation: this.getRedoOperation(),
            maxSize: this.maxHistorySize
        };
    }
}