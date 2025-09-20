// Main application entry point - initializes all components with proper loading sequence
class InfiniteCanvas {
    constructor() {
        this.world = null;
        this.cardManager = null;
        this.sidebar = null;
        this.storage = null;
        this.undoRedoManager = null;
        this.loadingOverlay = null;
        
        this.init();
    }
    
    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    }
    
    async start() {
        console.log('Initializing Infinite Canvas...');
        
        // Show loading overlay
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        try {
            // Initialize components in proper order
            await this.initializeComponents();
            
            // Load saved data and apply settings
            await this.loadApplicationState();
            
            // Initialize undo/redo with current state
            this.undoRedoManager.initialize();
            
            // Setup additional functionality
            this.setupGlobalEvents();
            
            console.log('Infinite Canvas initialized successfully!');
            
        } catch (error) {
            console.error('Failed to initialize Infinite Canvas:', error);
        } finally {
            // Hide loading overlay
            setTimeout(() => {
                this.loadingOverlay.classList.add('hidden');
                setTimeout(() => {
                    this.loadingOverlay.style.display = 'none';
                }, 300);
            }, 500); // Small delay to ensure everything is loaded
        }
    }
    
    async initializeComponents() {
        // Initialize storage first
        this.storage = new Storage();
        window.storage = this.storage;
        
        // Initialize undo/redo manager
        this.undoRedoManager = new UndoRedoManager();
        window.undoRedoManager = this.undoRedoManager;
        
        // Initialize world (panning, zooming, grid)
        this.world = new World();
        window.world = this.world;
        
        // Initialize card manager
        this.cardManager = new CardManager(this.world);
        window.cardManager = this.cardManager;
        
        // Initialize sidebar (including loading its width first)
        this.sidebar = new Sidebar();
        window.sidebar = this.sidebar;
        
        // Small delay to ensure all components are ready
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    async loadApplicationState() {
        // Load saved data
        const savedData = this.storage.loadData();
        
        if (savedData && savedData.cards && savedData.cards.length > 0) {
            console.log('Loading saved cards and world state...');
            
            // Load cards first
            this.cardManager.loadCards(savedData.cards);
            
            // Apply world state (position and zoom) before showing
            if (savedData.worldState) {
                this.storage.applyWorldState(savedData.worldState);
            } else {
                // Center view if no saved world state
                this.world.centerView();
                this.world.updateUI();
            }
        } else {
            console.log('No saved data found, creating default setup...');
            
            // Center view first
            this.world.centerView();
            
            // Create default card
            const defaultCards = this.storage.getDefaultCards();
            defaultCards.forEach(cardData => {
                this.cardManager.createCard(cardData);
            });
            
            // Update world view
            this.world.updateUI();
            
            // Save the default setup
            this.storage.saveCards(defaultCards);
        }
        
        // Ensure world position is properly set
        await new Promise(resolve => setTimeout(resolve, 50));
        this.world.updateUI();
    }
    
    setupGlobalEvents() {
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Z: Undo
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.performUndo();
            }
            
            // Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                this.performRedo();
            }
            
            // Ctrl/Cmd + N: New card
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.cardManager.addNewCard();
            }
            
            // Ctrl/Cmd + D: Duplicate active card or selected cards
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                if (this.cardManager.selectedCards.size > 0) {
                    // Save state before duplicating
                    this.undoRedoManager.saveState('duplicate_cards', {
                        cardIds: Array.from(this.cardManager.selectedCards)
                    });
                    
                    // Duplicate all selected cards
                    const selectedIds = Array.from(this.cardManager.selectedCards);
                    selectedIds.forEach(cardId => {
                        this.cardManager.duplicateCard(cardId);
                    });
                } else if (this.cardManager.activeCard) {
                    // Save state before duplicating
                    this.undoRedoManager.saveState('duplicate_card', {
                        cardId: this.cardManager.activeCard
                    });
                    
                    this.cardManager.duplicateCard(this.cardManager.activeCard);
                }
            }
            
            // Ctrl/Cmd + S: Manual save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.storage.saveData({
                    cards: this.cardManager.getAllCards(),
                    worldState: this.storage.getWorldState()
                });
                this.showNotification('Saved!');
            }
            
            // Ctrl/Cmd + E: Export data
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                this.storage.exportData();
            }
            
            // Delete key: Delete selected card(s)
            if (e.key === 'Delete' && !this.sidebar.isOpen) {
                if (this.cardManager.selectedCards.size > 0) {
                    const selectedCount = this.cardManager.selectedCards.size;
                    const message = selectedCount === 1 ? 
                        'Are you sure you want to delete the selected card?' : 
                        `Are you sure you want to delete the ${selectedCount} selected cards?`;
                    
                    if (confirm(message)) {
                        // Save state before deleting
                        this.undoRedoManager.saveState('delete_cards', {
                            cardIds: Array.from(this.cardManager.selectedCards)
                        });
                        
                        const selectedIds = Array.from(this.cardManager.selectedCards);
                        selectedIds.forEach(cardId => {
                            this.cardManager.deleteCard(cardId);
                        });
                    }
                }
            }
            
            // Escape key: Clear selection
            if (e.key === 'Escape') {
                if (this.sidebar.isOpen) {
                    this.sidebar.close();
                } else {
                    this.cardManager.clearSelection();
                }
            }
        });
        
        // Auto-save world state on pan/zoom
        let worldSaveTimeout = null;
        const originalUpdateUI = this.world.updateUI.bind(this.world);
        this.world.updateUI = () => {
            originalUpdateUI();
            
            // Debounced world state save
            if (worldSaveTimeout) clearTimeout(worldSaveTimeout);
            worldSaveTimeout = setTimeout(() => {
                this.storage.saveWorldState(this.storage.getWorldState());
            }, 2000);
        };
        
        // Handle file drops for import
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            const jsonFile = files.find(file => file.type === 'application/json' || file.name.endsWith('.json'));
            
            if (jsonFile) {
                this.importData(jsonFile);
            }
        });
        
        // Window resize handler
        window.addEventListener('resize', () => {
            this.world.updateUI();
        });
        
        // Before unload - save data
        window.addEventListener('beforeunload', () => {
            this.storage.saveData({
                cards: this.cardManager.getAllCards(),
                worldState: this.storage.getWorldState()
            });
        });
    }
    
    // Perform undo operation
    performUndo() {
        if (this.undoRedoManager.undo()) {
            const operation = this.undoRedoManager.getRedoOperation(); // Next operation that can be redone
            this.showNotification(`Undone: ${this.formatOperationName(operation)}`, 'info');
        } else {
            this.showNotification('Nothing to undo', 'warning');
        }
    }
    
    // Perform redo operation
    performRedo() {
        if (this.undoRedoManager.redo()) {
            const operation = this.undoRedoManager.getUndoOperation(); // Current operation that was redone
            this.showNotification(`Redone: ${this.formatOperationName(operation)}`, 'info');
        } else {
            this.showNotification('Nothing to redo', 'warning');
        }
    }
    
    // Format operation names for user display
    formatOperationName(operation) {
        const operationNames = {
            'initial_state': 'Initial State',
            'card_move': 'Move Cards',
            'multi_card_move': 'Move Multiple Cards',
            'content_change': 'Edit Content',
            'duplicate_card': 'Duplicate Card',
            'duplicate_cards': 'Duplicate Cards',
            'delete_cards': 'Delete Cards',
            'create_card': 'Create Card',
            'resize_card': 'Resize Card'
        };
        
        return operationNames[operation] || operation;
    }
    
    // Select all cards
    selectAllCards() {
        // Only allow if Ctrl is currently pressed
        if (!this.cardManager.isCtrlPressed) {
            return;
        }
        
        this.cardManager.clearSelection();
        
        // Select all cards
        this.cardManager.cards.forEach((cardData, cardId) => {
            this.cardManager.selectedCards.add(cardId);
            const element = this.world.world.querySelector(`[data-card-id="${cardId}"]`);
            if (element) {
                element.classList.add('selected');
            }
        });
        
        // Set the first card as active
        const firstCardId = Array.from(this.cardManager.cards.keys())[0];
        if (firstCardId) {
            this.cardManager.activeCard = firstCardId;
            const element = this.world.world.querySelector(`[data-card-id="${firstCardId}"]`);
            if (element) {
                element.classList.add('active');
            }
            
            // Open sidebar with first card data
            if (window.sidebar) {
                const cardData = this.cardManager.cards.get(firstCardId);
                window.sidebar.open(cardData);
            }
        }
        
        this.showNotification(`Selected ${this.cardManager.selectedCards.size} cards`);
    }
    
    // Import data from file
    async importData(file) {
        try {
            // Save current state before importing
            this.undoRedoManager.saveState('import_data');
            
            await this.storage.importData(file);
            this.showNotification('Data imported successfully!');
        } catch (error) {
            console.error('Import failed:', error);
            this.showNotification('Import failed: ' + error.message, 'error');
        }
    }
    
    // Show notification to user
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : type === 'info' ? '#3b82f6' : '#10b981'};
            color: white;
            border-radius: 6px;
            font-size: 14px;
            z-index: 3000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        `;
        notification.textContent = message;
        
        // Add slide-in animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(notification);
        
        // Remove after delay
        setTimeout(() => {
            notification.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                if (style.parentNode) {
                    style.parentNode.removeChild(style);
                }
            }, 300);
        }, 3000);
    }
    
    // Reset application to defaults
    reset() {
        if (confirm('Are you sure you want to reset everything? This will delete all cards and cannot be undone.')) {
            this.storage.clearData();
            this.cardManager.loadCards([]);
            this.world.centerView();
            this.world.scale = this.world.targetScale = 1;
            this.world.updateUI();
            this.storage.initialize();
            this.undoRedoManager.clearHistory();
            this.undoRedoManager.initialize();
            this.showNotification('Reset complete!');
        }
    }
    
    // Get application statistics
    getStats() {
        return {
            cardCount: this.cardManager.cards.size,
            selectedCount: this.cardManager.selectedCards.size,
            worldPosition: {
                x: Math.round(this.world.translateX),
                y: Math.round(this.world.translateY)
            },
            zoom: Math.round(this.world.scale * 100) + '%',
            sidebarWidth: this.sidebar.width + 'px',
            dataSize: JSON.stringify(this.storage.loadData()).length + ' bytes',
            undoRedo: this.undoRedoManager.getStats()
        };
    }
}

// Global utility functions
window.InfiniteCanvas = {
    // Expose useful functions globally
    addCard: () => window.cardManager?.addNewCard(),
    duplicateCard: () => {
        if (window.cardManager?.selectedCards.size > 0) {
            const selectedIds = Array.from(window.cardManager.selectedCards);
            return selectedIds.map(cardId => window.cardManager.duplicateCard(cardId));
        } else if (window.cardManager?.activeCard) {
            return window.cardManager.duplicateCard(window.cardManager.activeCard);
        }
    },
    selectAll: () => window.app?.selectAllCards(),
    clearSelection: () => window.cardManager?.clearSelection(),
    reset: () => window.app?.reset(),
    export: () => window.storage?.exportData(),
    stats: () => window.app?.getStats(),
    centerView: () => {
        if (window.world) {
            window.world.centerView();
            window.world.updateUI();
        }
    },
    undo: () => window.app?.performUndo(),
    redo: () => window.app?.performRedo(),
    undoStats: () => window.undoRedoManager?.getStats()
};

// Initialize the application
window.app = new InfiniteCanvas();

// Add some helpful console messages
console.log('%cInfinite Canvas App', 'font-size: 20px; font-weight: bold; color: #3b82f6;');
console.log('Available commands:');
console.log('- InfiniteCanvas.addCard() - Add a new card');
console.log('- InfiniteCanvas.duplicateCard() - Duplicate selected cards');
console.log('- InfiniteCanvas.selectAll() - Select all cards');
console.log('- InfiniteCanvas.clearSelection() - Clear selection');
console.log('- InfiniteCanvas.reset() - Reset everything');
console.log('- InfiniteCanvas.export() - Export data');
console.log('- InfiniteCanvas.stats() - Show statistics');
console.log('- InfiniteCanvas.centerView() - Center the view');
console.log('- InfiniteCanvas.undo() - Undo last action');
console.log('- InfiniteCanvas.redo() - Redo last undone action');
console.log('- InfiniteCanvas.undoStats() - Show undo/redo statistics');
console.log('');
console.log('Keyboard shortcuts:');
console.log('- Ctrl/Cmd + Click: Multi-select cards (only while held)');
console.log('- Ctrl/Cmd + N: New card');
console.log('- Ctrl/Cmd + D: Duplicate selected cards');
console.log('- Ctrl/Cmd + S: Save');
console.log('- Ctrl/Cmd + E: Export');
console.log('- Ctrl/Cmd + Z: Undo');
console.log('- Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z: Redo');
console.log('- Delete: Delete selected cards');
console.log('- Escape: Clear selection or close sidebar');