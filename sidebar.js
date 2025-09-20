// Sidebar management - handles the right-side editing panel with resize functionality
class Sidebar {
    constructor() {
        this.isOpen = false;
        this.currentCard = null;
        this.editor = null;
        this.defaultWidth = 420;
        this.width = this.defaultWidth;
        this.minWidth = 300;
        this.maxWidth = 800;
        
        // Resize state
        this.isResizing = false;
        this.resizeStartX = 0;
        this.resizeStartWidth = 0;
        
        // Content change tracking for undo/redo
        this.lastSavedContent = '';
        this.contentChangeTimeout = null;
        
        // DOM elements
        this.sidebar = document.getElementById('sidebar');
        this.resizeHandle = document.getElementById('sidebarResizeHandle');
        this.viewport = document.getElementById('viewport');
        this.status = document.getElementById('status');
        this.closeBtn = document.getElementById('closeSidebar');
        this.widthInput = document.getElementById('cardWidth');
        this.heightInput = document.getElementById('cardHeight');
        this.saveBtn = document.getElementById('saveCard');
        this.duplicateBtn = document.getElementById('duplicateCard');
        this.deleteBtn = document.getElementById('deleteCard');
        this.addBtn = document.getElementById('addCard');
        
        this.init();
    }
    
    init() {
        this.loadSidebarWidth();
        this.setupEditor();
        this.setupEventListeners();
        this.setupResizeHandle();
    }
    
    loadSidebarWidth() {
        const savedWidth = localStorage.getItem('sidebar_width');
        if (savedWidth) {
            this.width = Math.max(this.minWidth, Math.min(this.maxWidth, parseInt(savedWidth)));
        }
        this.applySidebarWidth();
    }
    
    applySidebarWidth() {
        this.sidebar.style.width = `${this.width}px`;
    }
    
    saveSidebarWidth() {
        localStorage.setItem('sidebar_width', this.width.toString());
    }
    
    setupEditor() {
        // Initialize Quill editor with enhanced toolbar including colors and custom color support
        const quillOptions = {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
                        [{ 'font': [] }],
                        [{ 'size': ['small', false, 'large', 'huge'] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'script': 'sub'}, { 'script': 'super' }],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'indent': '-1'}, { 'indent': '+1' }],
                        ['blockquote', 'code-block'],
                        [{ 'direction': 'rtl' }],
                        [{ 'align': [] }],
                        ['link', 'image', 'video'],
                        ['clean']
                    ],
                    handlers: {
                        'color': (value) => {
                            if (value === 'custom') {
                                this.showCustomColorPicker('color');
                            } else {
                                this.editor.format('color', value);
                            }
                        },
                        'background': (value) => {
                            if (value === 'custom') {
                                this.showCustomColorPicker('background');
                            } else {
                                this.editor.format('background', value);
                            }
                        }
                    }
                }
            },
            placeholder: 'Enter card content...'
        };
        
        // Create editor with a delay to ensure DOM is ready
        setTimeout(() => {
            this.editor = new Quill('#editor', quillOptions);
            
            // Add custom color options to color pickers
            this.addCustomColorOptions();
            
            // Track content changes for undo/redo
            this.editor.on('text-change', (delta, oldDelta, source) => {
                if (this.currentCard && window.cardManager && source === 'user') {
                    const content = this.editor.root.innerHTML;
                    
                    // Update the card immediately
                    window.cardManager.updateCard(this.currentCard.id, { content });
                    this.currentCard.content = content;
                    
                    // Save content state for undo/redo (debounced)
                    this.saveContentStateDebounced();
                }
            });
            
            // Track when user starts editing to capture initial state
            this.editor.on('selection-change', (range, oldRange, source) => {
                if (range && !oldRange && source === 'user' && this.currentCard) {
                    // User just focused the editor, save current content as starting point
                    this.lastSavedContent = this.currentCard.content;
                }
            });
            
        }, 100);
    }
    
    saveContentStateDebounced() {
        if (this.contentChangeTimeout) {
            clearTimeout(this.contentChangeTimeout);
        }
        
        this.contentChangeTimeout = setTimeout(() => {
            if (this.currentCard && window.undoRedoManager && this.lastSavedContent !== this.currentCard.content) {
                window.undoRedoManager.saveContentState(
                    this.currentCard.id,
                    this.lastSavedContent,
                    this.currentCard.content
                );
                this.lastSavedContent = this.currentCard.content;
            }
        }, 1000); // 1 second debounce
    }
    
    addCustomColorOptions() {
        // Add custom color option to color picker
        const colorPicker = this.editor.getModule('toolbar').container.querySelector('.ql-color .ql-picker-options');
        const backgroundPicker = this.editor.getModule('toolbar').container.querySelector('.ql-background .ql-picker-options');
        
        if (colorPicker) {
            const customColorItem = document.createElement('span');
            customColorItem.className = 'ql-picker-item ql-custom-color';
            customColorItem.setAttribute('data-value', 'custom');
            customColorItem.title = 'Custom Color';
            customColorItem.addEventListener('click', () => this.showCustomColorPicker('color'));
            colorPicker.appendChild(customColorItem);
        }
        
        if (backgroundPicker) {
            const customBgItem = document.createElement('span');
            customBgItem.className = 'ql-picker-item ql-custom-color';
            customBgItem.setAttribute('data-value', 'custom');
            customBgItem.title = 'Custom Background Color';
            customBgItem.addEventListener('click', () => this.showCustomColorPicker('background'));
            backgroundPicker.appendChild(customBgItem);
        }
    }
    
    showCustomColorPicker(type) {
        // Create a temporary color input
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.style.position = 'absolute';
        colorInput.style.left = '-9999px';
        colorInput.style.opacity = '0';
        
        // Get current color if any
        const selection = this.editor.getSelection();
        if (selection) {
            const format = this.editor.getFormat(selection);
            if (format[type]) {
                colorInput.value = this.rgbToHex(format[type]) || '#000000';
            }
        }
        
        document.body.appendChild(colorInput);
        
        colorInput.addEventListener('change', (e) => {
            const color = e.target.value;
            if (selection) {
                this.editor.formatText(selection.index, selection.length, type, color);
            } else {
                this.editor.format(type, color);
            }
            document.body.removeChild(colorInput);
        });
        
        colorInput.addEventListener('blur', () => {
            setTimeout(() => {
                if (document.body.contains(colorInput)) {
                    document.body.removeChild(colorInput);
                }
            }, 100);
        });
        
        colorInput.click();
    }
    
    rgbToHex(rgb) {
        if (!rgb || rgb.startsWith('#')) return rgb;
        
        const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (!match) return rgb;
        
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
    
    setupEventListeners() {
        // Close button
        this.closeBtn.addEventListener('click', () => {
            this.close();
        });
        
        // Width input
        this.widthInput.addEventListener('input', (e) => {
            const width = parseInt(e.target.value) || 300;
            
            if (this.currentCard && window.cardManager) {
                window.cardManager.updateCard(this.currentCard.id, { width });
                this.currentCard.width = width;
            }
        });
        
        // Height input (supports 'auto' and numeric values)
        this.heightInput.addEventListener('input', (e) => {
            let height = e.target.value.trim();
            
            if (height === 'auto' || height === '') {
                height = 'auto';
            } else {
                const numHeight = parseInt(height);
                if (!isNaN(numHeight) && numHeight > 0) {
                    height = numHeight;
                } else {
                    height = 'auto';
                    e.target.value = 'auto';
                }
            }
            
            if (this.currentCard && window.cardManager) {
                window.cardManager.updateCard(this.currentCard.id, { height });
                this.currentCard.height = height;
            }
        });
        
        // Save button (for manual save/close)
        this.saveBtn.addEventListener('click', () => {
            this.close();
        });
        
        // Duplicate button
        this.duplicateBtn.addEventListener('click', () => {
            if (this.currentCard && window.cardManager) {
                // Save state before duplicating
                if (window.undoRedoManager) {
                    window.undoRedoManager.saveState('duplicate_card', {
                        cardId: this.currentCard.id
                    });
                }
                
                window.cardManager.duplicateCard(this.currentCard.id);
            }
        });
        
        // Delete button
        this.deleteBtn.addEventListener('click', () => {
            if (this.currentCard && window.cardManager && 
                confirm('Are you sure you want to delete this card?')) {
                
                // Save state before deleting
                if (window.undoRedoManager) {
                    window.undoRedoManager.saveState('delete_cards', {
                        cardIds: [this.currentCard.id]
                    });
                }
                
                window.cardManager.deleteCard(this.currentCard.id);
                this.close();
            }
        });
        
        // Add new card button
        this.addBtn.addEventListener('click', () => {
            if (window.cardManager) {
                window.cardManager.addNewCard();
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }
    
    setupResizeHandle() {
        this.resizeHandle.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                this.isResizing = true;
                this.resizeStartX = e.clientX;
                this.resizeStartWidth = this.width;
                this.resizeHandle.classList.add('dragging');
                document.body.style.cursor = 'ew-resize';
                document.body.style.userSelect = 'none';
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isResizing) {
                // Calculate new width based on mouse movement
                // Moving left (negative delta) increases width, moving right decreases width
                const deltaX = this.resizeStartX - e.clientX;
                const newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, this.resizeStartWidth + deltaX));
                
                this.width = newWidth;
                this.applySidebarWidth();
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (this.isResizing) {
                this.isResizing = false;
                this.resizeHandle.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                this.saveSidebarWidth();
            }
        });
    }
    
    open(cardData) {
        this.isOpen = true;
        this.currentCard = cardData;
        
        // Save current content as baseline for undo/redo
        this.lastSavedContent = cardData.content;
        
        // Update UI elements
        this.sidebar.classList.add('open');
        
        // Populate form with card data
        this.populateForm(cardData);
        
        // Focus the editor with safety check
        setTimeout(() => {
            if (this.editor && this.editor.focus) {
                this.editor.focus();
            }
        }, 350);
    }
    
    close() {
        // Save any pending content changes before closing
        if (this.contentChangeTimeout) {
            clearTimeout(this.contentChangeTimeout);
            this.contentChangeTimeout = null;
            
            // Immediately save if there are pending changes
            if (this.currentCard && window.undoRedoManager && this.lastSavedContent !== this.currentCard.content) {
                window.undoRedoManager.saveContentState(
                    this.currentCard.id,
                    this.lastSavedContent,
                    this.currentCard.content
                );
            }
        }
        
        this.isOpen = false;
        this.currentCard = null;
        this.lastSavedContent = '';
        
        // Update UI elements
        this.sidebar.classList.remove('open');
        
        // Deselect active card
        if (window.cardManager && window.cardManager.activeCard) {
            const activeElement = document.querySelector(`[data-card-id="${window.cardManager.activeCard}"]`);
            if (activeElement) {
                activeElement.classList.remove('active');
            }
            window.cardManager.activeCard = null;
        }
    }
    
    populateForm(cardData) {
        // Set width input
        this.widthInput.value = cardData.width || 300;
        
        // Set height input (handle auto and numeric values)
        if (cardData.height === 'auto' || cardData.height === undefined) {
            this.heightInput.value = 'auto';
        } else {
            this.heightInput.value = cardData.height;
        }
        
        // Set editor content with a safety check
        if (this.editor && this.editor.root) {
            this.editor.root.innerHTML = cardData.content;
            // Clear editor history to prevent undo to previous card
            this.editor.history.clear();
        } else {
            // If editor isn't ready yet, wait for it
            setTimeout(() => {
                if (this.editor && this.editor.root) {
                    this.editor.root.innerHTML = cardData.content;
                    this.editor.history.clear();
                }
            }, 150);
        }
    }
    
    // Update current card data (called from external sources)
    updateCard(updates) {
        if (this.currentCard) {
            Object.assign(this.currentCard, updates);
            
            // Update form if needed
            if (updates.width !== undefined) {
                this.widthInput.value = updates.width;
            }
            
            if (updates.height !== undefined) {
                if (updates.height === 'auto') {
                    this.heightInput.value = 'auto';
                } else {
                    this.heightInput.value = updates.height;
                }
            }
            
            if (updates.content !== undefined) {
                // Only update if different to avoid cursor issues
                if (this.editor && this.editor.root && this.editor.root.innerHTML !== updates.content) {
                    this.editor.root.innerHTML = updates.content;
                }
                
                // Update the baseline content for undo/redo tracking
                this.lastSavedContent = updates.content;
            }
        }
    }
}