// Storage management - handles saving and loading from localStorage
class Storage {
    constructor() {
        this.STORAGE_KEY = 'infinite_canvas_data';
        this.AUTO_SAVE_DELAY = 1000; // ms
        this.autoSaveTimeout = null;
    }
    
    // Save all data to localStorage
    saveData(data) {
        try {
            const dataToSave = {
                cards: data.cards || [],
                worldState: data.worldState || {},
                version: '1.0',
                timestamp: Date.now()
            };
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(dataToSave));
            console.log('Data saved to localStorage');
        } catch (error) {
            console.error('Failed to save data to localStorage:', error);
        }
    }
    
    // Load all data from localStorage
    loadData() {
        try {
            const savedData = localStorage.getItem(this.STORAGE_KEY);
            if (savedData) {
                const data = JSON.parse(savedData);
                console.log('Data loaded from localStorage');
                return data;
            }
        } catch (error) {
            console.error('Failed to load data from localStorage:', error);
        }
        return null;
    }
    
    // Save cards with auto-save debouncing
    saveCards(cards) {
        // Clear existing timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        
        // Set new timeout for auto-save
        this.autoSaveTimeout = setTimeout(() => {
            this.saveData({
                cards: cards,
                worldState: this.getWorldState()
            });
        }, this.AUTO_SAVE_DELAY);
    }
    
    // Save world state (position, zoom)
    saveWorldState(worldState) {
        this.saveData({
            cards: window.cardManager ? window.cardManager.getAllCards() : [],
            worldState: worldState
        });
    }
    
    // Get current world state
    getWorldState() {
        if (window.world) {
            return {
                translateX: window.world.translateX,
                translateY: window.world.translateY,
                scale: window.world.scale,
                targetTX: window.world.targetTX,
                targetTY: window.world.targetTY,
                targetScale: window.world.targetScale
            };
        }
        return {};
    }
    
    // Apply world state
    applyWorldState(worldState) {
        if (window.world && worldState) {
            if (worldState.translateX !== undefined) {
                window.world.translateX = worldState.translateX;
                window.world.targetTX = worldState.targetTX || worldState.translateX;
            }
            if (worldState.translateY !== undefined) {
                window.world.translateY = worldState.translateY;
                window.world.targetTY = worldState.targetTY || worldState.translateY;
            }
            if (worldState.scale !== undefined) {
                window.world.scale = worldState.scale;
                window.world.targetScale = worldState.targetScale || worldState.scale;
            }
            
            window.world.updateUI();
        }
    }
    
    // Clear all saved data
    clearData() {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
            console.log('Saved data cleared');
            return true;
        } catch (error) {
            console.error('Failed to clear saved data:', error);
            return false;
        }
    }
    
    // Get the default/example card data
    getDefaultCards() {
        return [{
            id: 1,
            x: 0,
            y: 0,
            width: 300,
            height: 'auto',
            content: `
                <h2 style="color: #2563eb;">Welcome to Infinite Canvas</h2>
                <p>This is your first card! You can:</p>
                <ul>
                    <li><strong>Double-click</strong> on any card to edit it</li>
                    <li><strong>Drag</strong> cards to move them around</li>
                    <li><strong>Pan</strong> by clicking and dragging on empty space</li>
                    <li><strong>Zoom</strong> with your mouse wheel</li>
                </ul>
                <p>Cards automatically snap to align with each other, and all changes are saved automatically to your browser's local storage.</p>
                <p><em>Double-click this card to start editing!</em></p>
            `
        }];
    }
    
    // Initialize storage - load data or create default
    initialize() {
        const savedData = this.loadData();
        
        if (savedData && savedData.cards && savedData.cards.length > 0) {
            // Load saved data
            console.log('Loading saved cards and world state...');
            
            // Load cards
            if (window.cardManager) {
                window.cardManager.loadCards(savedData.cards);
            }
            
            // Load world state
            if (savedData.worldState) {
                // Delay world state application to ensure world is initialized
                setTimeout(() => {
                    this.applyWorldState(savedData.worldState);
                }, 100);
            }
            
            return true;
        } else {
            // Create default card
            console.log('No saved data found, creating default card...');
            
            if (window.cardManager) {
                const defaultCards = this.getDefaultCards();
                defaultCards.forEach(cardData => {
                    window.cardManager.createCard(cardData);
                });
                
                // Save the default setup
                this.saveCards(defaultCards);
            }
            
            return false;
        }
    }
    
    // Export data as JSON
    exportData() {
        const data = this.loadData();
        if (data) {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `infinite_canvas_export_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }
    
    // Import data from JSON file
    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    // Validate data structure
                    if (data.cards && Array.isArray(data.cards)) {
                        this.saveData(data);
                        
                        // Reload the app with new data
                        if (window.cardManager) {
                            window.cardManager.loadCards(data.cards);
                        }
                        
                        if (data.worldState) {
                            this.applyWorldState(data.worldState);
                        }
                        
                        resolve(data);
                    } else {
                        reject(new Error('Invalid data format'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }
}