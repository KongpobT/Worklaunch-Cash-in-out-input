const APP_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwznFGWDZuz9IVCw1LrPrOCzKZ8VSiqnT_GsYdBeVWrKr_fS1Az2o6sqrqHhATWnmpW/exec";

let allTransactions = []; // Store fetched data

document.addEventListener('DOMContentLoaded', () => {
    // --- Tabs Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'history-tab') {
                if (allTransactions.length === 0) {
                    fetchTransactions(false);
                } else {
                    // Data is already fetched, so just render it
                    renderTable();
                }
            }
        });
    });

    // Fetch data in background on load for autocomplete
    if (allTransactions.length === 0) {
        fetchTransactions(true);
    }

    // --- Vendor Autocomplete Logic ---
    const vendorInput = document.getElementById('Vendor');
    const categoryInput = document.getElementById('Category');
    const descriptionInput = document.getElementById('Description');
    const suggestionsBox = document.getElementById('vendor-suggestions');

    function showSuggestions() {
        const query = vendorInput.value.trim();

        if (!query || allTransactions.length === 0 || typeof Fuse === 'undefined') {
            suggestionsBox.classList.add('hidden');
            return;
        }

        const fuse = new Fuse(allTransactions, {
            keys: ['Vendor'],
            threshold: 0.4,
            ignoreLocation: true
        });

        const results = fuse.search(query);

        const uniqueVendors = new Map();
        results.forEach(res => {
            const t = res.item;
            if (t.Vendor && !uniqueVendors.has(t.Vendor.toLowerCase())) {
                uniqueVendors.set(t.Vendor.toLowerCase(), t);
            }
        });

        const topSuggestions = Array.from(uniqueVendors.values()).slice(0, 5);

        if (topSuggestions.length > 0) {
            suggestionsBox.innerHTML = '';
            topSuggestions.forEach(t => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.innerHTML = `
                    <div class="suggestion-vendor">${t.Vendor}</div>
                    <div class="suggestion-details">${t.Category || ''} • ${t.Description || ''}</div>
                `;
                div.addEventListener('click', (e) => {
                    e.stopPropagation(); // prevent document click from hiding immediately
                    vendorInput.value = t.Vendor;

                    if (t.Category) {
                        const options = Array.from(categoryInput.options).map(o => o.value);
                        if (options.includes(t.Category)) {
                            categoryInput.value = t.Category;
                        }
                    }
                    if (t.Description) {
                        descriptionInput.value = t.Description;
                    }

                    suggestionsBox.classList.add('hidden');
                });
                suggestionsBox.appendChild(div);
            });
            suggestionsBox.classList.remove('hidden');
        } else {
            suggestionsBox.classList.add('hidden');
        }
    }

    vendorInput.addEventListener('input', showSuggestions);
    vendorInput.addEventListener('focus', showSuggestions);
    vendorInput.addEventListener('click', showSuggestions);

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (vendorInput && suggestionsBox) {
            if (!vendorInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.classList.add('hidden');
            }
        }
    });

    // --- Add Transaction Form Logic ---
    const dateInput = document.getElementById('Date');
    const today = new Date();

    // Initialize Flatpickr
    const fp = flatpickr(dateInput, {
        dateFormat: "Y-m-d",     // Actual value of the hidden input
        altInput: true,          // Create a secondary visual input
        altFormat: "d/m/Y",      // Visual format DD/MM/YYYY
        defaultDate: today,
        disableMobile: "true",   // Use Flatpickr UI on mobile devices as well
        onReady: function (selectedDates, dateStr, instance) {
            // Create a custom 'Today' button at the bottom of the calendar
            const todayBtn = document.createElement("div");
            todayBtn.innerHTML = "Select Today";
            todayBtn.style.cursor = "pointer";
            todayBtn.style.padding = "10px";
            todayBtn.style.textAlign = "center";
            todayBtn.style.borderTop = "1px solid var(--glass-border)";
            todayBtn.style.fontWeight = "600";
            todayBtn.style.color = "var(--accent-color)";
            todayBtn.style.transition = "background 0.2s";

            todayBtn.addEventListener("mouseenter", () => {
                todayBtn.style.background = "rgba(255, 255, 255, 0.05)";
            });
            todayBtn.addEventListener("mouseleave", () => {
                todayBtn.style.background = "transparent";
            });

            todayBtn.addEventListener("click", function () {
                instance.setDate(new Date(), true);
                instance.close();
            });

            instance.calendarContainer.appendChild(todayBtn);
        }
    });

    const form = document.getElementById('transaction-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = document.getElementById('btn-text');
    const spinner = document.getElementById('loading-spinner');
    const addNotification = document.getElementById('add-notification');
    const receiptFileInput = document.getElementById('ReceiptFile');

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = reader.result.split(',')[1];
                resolve({
                    base64: base64String,
                    name: file.name,
                    type: file.type
                });
            };
            reader.onerror = error => reject(error);
        });
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        addNotification.classList.add('hidden');
        addNotification.className = 'notification hidden';

        submitBtn.disabled = true;
        btnText.textContent = 'Submitting...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            const dateObj = new Date(data.Date);
            const day = String(dateObj.getDate()).padStart(2, '0');
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const year = dateObj.getFullYear();

            data.Date = `${day}/${month}/${year}`;
            data.Month = `${year}-${dateObj.getMonth() + 1}`;
            data.Year = year.toString();
            data.action = 'add'; // Specify action

            // Process receipt file upload if present
            let receiptFile = null;
            if (receiptFileInput && receiptFileInput.files && receiptFileInput.files[0]) {
                try {
                    receiptFile = await fileToBase64(receiptFileInput.files[0]);
                } catch (fileError) {
                    console.error("Error reading receipt file:", fileError);
                    showNotification(addNotification, 'Failed to read receipt file.', 'error');
                    submitBtn.disabled = false;
                    btnText.textContent = 'Add Transaction';
                    spinner.classList.add('hidden');
                    return;
                }
            }

            // Remove the raw input value which is just a string or File object from serialize data
            delete data.ReceiptFile;
            data.receiptFile = receiptFile;

            // Prevent Duplication Check
            if (allTransactions && allTransactions.length > 0) {
                const formAmt = parseFloat(String(data.AmountOrig).replace(/,/g, ''));
                const isDuplicate = allTransactions.some(t => {
                    const histAmt = parseFloat(String(t.AmountOrig).replace(/,/g, ''));
                    let dateMatches = (t.Date === data.Date);

                    if (!dateMatches && t.Date) {
                        try {
                            const histDateObj = new Date(t.Date);
                            if (!isNaN(histDateObj.getTime())) {
                                const histDay = String(histDateObj.getDate()).padStart(2, '0');
                                const histMonth = String(histDateObj.getMonth() + 1).padStart(2, '0');
                                const histYear = histDateObj.getFullYear();
                                dateMatches = (`${histDay}/${histMonth}/${histYear}` === data.Date);
                            }
                        } catch (e) { }
                    }

                    const vendorMatches = t.Vendor && data.Vendor && t.Vendor.toLowerCase().trim() === data.Vendor.toLowerCase().trim();
                    const amountMatches = histAmt === formAmt;

                    return dateMatches && vendorMatches && amountMatches;
                });

                if (isDuplicate) {
                    const proceed = confirm("⚠️ Warning: A transaction with this same Date, Vendor, and Amount already exists in your history.\n\nAre you sure you want to add it again?");
                    if (!proceed) {
                        submitBtn.disabled = false;
                        btnText.textContent = 'Add Transaction';
                        spinner.classList.add('hidden');
                        return; // Cancel the submission
                    }
                }
            }

            await fetch(APP_SCRIPT_URL, {
                method: "POST",
                mode: "no-cors",
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            });

            showNotification(addNotification, 'Transaction successfully added!', 'success');

            const currentAccount = document.getElementById('Account').value;
            const currentPaidBy = document.getElementById('PaidBy').value;
            form.reset();

            // Reset flatpickr to today
            fp.setDate(new Date());
            document.getElementById('Account').value = currentAccount;
            document.getElementById('PaidBy').value = currentPaidBy;

            // Reset preview
            const filePreviewContainer = document.getElementById('file-preview-container');
            const scanBtn = document.getElementById('scan-receipt-btn');
            const imagePreview = document.getElementById('image-preview');
            const pdfPreview = document.getElementById('pdf-preview');
            if (filePreviewContainer) filePreviewContainer.classList.add('hidden');
            if (scanBtn) scanBtn.classList.add('hidden');
            if (imagePreview) { imagePreview.classList.add('hidden'); imagePreview.src = ""; }
            if (pdfPreview) { pdfPreview.classList.add('hidden'); pdfPreview.src = ""; }

            // Invalidate cache and refetch in background for continuous autocomplete functionality
            allTransactions = [];
            fetchTransactions(true);

        } catch (error) {
            console.error('Error submitting transaction:', error);
            showNotification(addNotification, 'Failed to add transaction.', 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Add Transaction';
            spinner.classList.add('hidden');
        }
    });

    // --- History Logic ---
    const refreshBtn = document.getElementById('refresh-btn');
    const refreshSpinner = document.getElementById('refresh-spinner');
    const searchInput = document.getElementById('search-input');
    const filterYear = document.getElementById('filter-year');
    const filterMonth = document.getElementById('filter-month');
    const filterCategory = document.getElementById('filter-category');

    refreshBtn.addEventListener('click', () => fetchTransactions(false));
    searchInput.addEventListener('input', renderTable);
    filterYear.addEventListener('change', renderTable);
    filterMonth.addEventListener('change', renderTable);
    filterCategory.addEventListener('change', renderTable);

    async function fetchTransactions(isBackground = false) {
        const tbody = document.getElementById('table-body');

        if (!isBackground) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">Loading transactions...</td></tr>';
            refreshSpinner.classList.remove('hidden');
        }

        try {
            const response = await fetch(APP_SCRIPT_URL);
            const data = await response.json();

            // data is a 2D array. Row 0 is headers.
            if (data && data.length > 1) { // ensure there is data beyond the header row
                allTransactions = data.slice(1).map((row, index) => {
                    // Map by known column indices based on your spreadsheet structure
                    return {
                        _rowIndex: index + 2, // +2 because sheet rows are 1-indexed and we skipped header
                        Date: row[0],
                        Month: row[1],
                        Account: row[2],
                        Category: row[3],
                        Vendor: row[4],
                        Description: row[5],
                        Curr: row[6],
                        AmountOrig: row[7],
                        AmountTHB: row[8],
                        Direction: row[9],
                        PaidBy: row[10],
                        Reimburse: row[11],
                        ReceiptRef: row[12],
                        Status: row[13],
                        Year: row[14]
                    };
                });

                // Filter out any blank rows that might be at the bottom of the sheet
                allTransactions = allTransactions.filter(t => t.Date !== "" || t.Vendor !== "" || t.Description !== "");

                populateFilters();

                // Only render the table if we're on the history tab or not in background
                if (!isBackground || document.getElementById('history-tab').classList.contains('active')) {
                    renderTable();
                }
            } else {
                if (!isBackground) tbody.innerHTML = '<tr><td colspan="8" class="text-center">No data found.</td></tr>';
            }
        } catch (error) {
            console.error("Fetch error", error);
            if (!isBackground) tbody.innerHTML = '<tr><td colspan="8" class="text-center">Error loading data. Make sure Apps Script allows GET requests.</td></tr>';
        } finally {
            if (!isBackground) refreshSpinner.classList.add('hidden');
        }
    }

    function populateFilters() {
        const categories = new Set();
        const years = new Set();

        allTransactions.forEach(t => {
            if (t.Category) categories.add(t.Category);
            if (t.Date) {
                let dateObj = new Date(t.Date);
                if (isNaN(dateObj) && typeof t.Date === 'string' && t.Date.includes('/')) {
                    const parts = t.Date.split('/');
                    if (parts.length === 3) dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
                }
                if (!isNaN(dateObj)) years.add(dateObj.getFullYear());
            }
        });

        filterYear.innerHTML = '<option value="">All Years</option>';
        [...years].sort((a, b) => b - a).forEach(y => {
            filterYear.innerHTML += `<option value="${y}">${y}</option>`;
        });

        // Clean month filter: exactly 1-12
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        filterMonth.innerHTML = '<option value="">All Months</option>';
        monthNames.forEach((name, index) => {
            filterMonth.innerHTML += `<option value="${index + 1}">${name}</option>`;
        });

        filterCategory.innerHTML = '<option value="">All Categories</option>';
        [...categories].sort().forEach(c => {
            // Filter out '-' or header rows that might sneak in
            if (c && c !== '-' && c.toLowerCase() !== 'category') {
                filterCategory.innerHTML += `<option value="${c}">${c}</option>`;
            }
        });
    }

    function renderTable() {
        const tbody = document.getElementById('table-body');
        const searchTerm = searchInput.value.toLowerCase();
        const selectedYear = filterYear.value;
        const selectedMonth = filterMonth.value;
        const selectedCategory = filterCategory.value;

        // Apply Fuse.js for Search if search term exists
        let searchResults = allTransactions;
        if (searchTerm && typeof Fuse !== 'undefined') {
            const fuse = new Fuse(allTransactions, {
                keys: ['Vendor', 'Description', 'Category', 'AmountTHB'],
                threshold: 0.3, // Allows fuzzy matching (typos, order doesn't matter)
                ignoreLocation: true // Matches anywhere in the string
            });
            searchResults = fuse.search(searchTerm).map(result => result.item);
        } else if (searchTerm) {
            // Fallback just in case Fuse fails to load
            searchResults = allTransactions.filter(t => {
                const searchString = `${t.Vendor} ${t.Description} ${t.AmountOrig} ${t.AmountTHB}`.toLowerCase();
                return searchString.includes(searchTerm);
            });
        }

        const filtered = searchResults.filter(t => {
            // Extract the actual month and year directly from the Date column
            let itemMonth = "";
            let itemYear = "";
            if (t.Date) {
                let dateObj = new Date(t.Date);
                if (isNaN(dateObj) && typeof t.Date === 'string' && t.Date.includes('/')) {
                    const parts = t.Date.split('/');
                    if (parts.length === 3) dateObj = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
                }
                if (!isNaN(dateObj)) {
                    itemMonth = String(dateObj.getMonth() + 1);
                    itemYear = String(dateObj.getFullYear());
                }
            }

            const matchYear = !selectedYear || itemYear === selectedYear;
            const matchMonth = !selectedMonth || itemMonth === selectedMonth;
            const matchCategory = !selectedCategory || t.Category === selectedCategory;

            return matchYear && matchMonth && matchCategory;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center">No matching transactions.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        // Sort descending by date roughly (or we just keep sheet order, but let's reverse to show newest if assuming sorted)
        // Note: Sheets might be sorted ascending. Reverse helps show latest.
        filtered.reverse().forEach(t => {
            const tr = document.createElement('tr');

            // Format Date safely
            let dateStr = t.Date;
            if (t.Date instanceof Date) {
                const day = String(t.Date.getDate()).padStart(2, '0');
                const month = String(t.Date.getMonth() + 1).padStart(2, '0');
                dateStr = `${day}/${month}/${t.Date.getFullYear()}`;
            } else if (typeof t.Date === 'string') {
                if (t.Date.includes('T')) {
                    const d = new Date(t.Date);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    dateStr = `${day}/${month}/${d.getFullYear()}`;
                } else if (t.Date.includes('-') && !t.Date.includes('/')) {
                    const d = new Date(t.Date);
                    if (!isNaN(d)) {
                        const day = String(d.getDate()).padStart(2, '0');
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        dateStr = `${day}/${month}/${d.getFullYear()}`;
                    }
                }
                // if it's already DD/MM/YYYY it stays as t.Date
            }

            let statusClass = (t.Status || '').toLowerCase();
            let directionClass = (t.Direction || '').toLowerCase().replace(/\s+/g, '-');

            tr.innerHTML = `
                <td>${dateStr}</td>
                <td>${t.Vendor || '-'}</td>
                <td>${t.Description || '-'}</td>
                <td>${t.Category || '-'}</td>
                <td><span class="direction-badge ${directionClass}">${t.Direction || '-'}</span></td>
                <td>${parseFloat(t.AmountTHB || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td><span class="status-pill ${statusClass}">${t.Status || '-'}</span></td>
                <td>
                    <button class="delete-btn" data-row="${t._rowIndex}">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Add Delete Listeners
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                window.currentRowToDelete = e.target.getAttribute('data-row');
                window.currentBtnToDelete = e.target;
                document.getElementById('delete-modal').classList.remove('hidden');
            });
        });
    }

    async function deleteTransaction(row, btnElement) {
        const historyNotif = document.getElementById('history-notification');
        const originalText = btnElement.textContent;
        btnElement.textContent = '...';
        btnElement.disabled = true;

        try {
            const data = { action: 'delete', row: parseInt(row) };

            await fetch(APP_SCRIPT_URL, {
                method: "POST",
                mode: "no-cors",
                body: JSON.stringify(data),
                headers: { 'Content-Type': 'application/json' }
            });

            // Assuming success due to no-cors
            showNotification(historyNotif, `Row ${row} deleted successfully. Refreshing...`, 'success');

            // Remove from local cache and re-render without full fetch
            allTransactions = allTransactions.filter(t => t._rowIndex !== parseInt(row));

            // Shift row indices for elements below the deleted row (optional, but good for accuracy if multiple deletes without refresh)
            allTransactions.forEach(t => {
                if (t._rowIndex > parseInt(row)) {
                    t._rowIndex -= 1;
                }
            });

            renderTable();

        } catch (error) {
            console.error('Error deleting:', error);
            showNotification(historyNotif, 'Failed to delete transaction.', 'error');
            btnElement.textContent = originalText;
            btnElement.disabled = false;
        }
    }

    function showNotification(element, message, type) {
        element.textContent = message;
        element.className = `notification ${type}`;
        element.classList.remove('hidden');
        setTimeout(() => {
            element.classList.add('hidden');
        }, 5000);
    }

    // --- Tab Switching Logic (Initial setup) ---
    document.getElementById('add-tab').classList.add('active');

    // --- Settings & AI Scanner Logic ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const apiKeyInput = document.getElementById('gemini-api-key');

    const scanBtn = document.getElementById('scan-receipt-btn');
    const scanSpinner = document.getElementById('scan-spinner');
    const scanBtnText = document.getElementById('scan-btn-text');

    // Load API Key
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) apiKeyInput.value = savedKey;

    settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));
    saveSettingsBtn.addEventListener('click', () => {
        const key = apiKeyInput.value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            settingsModal.classList.add('hidden');
            showNotification(document.getElementById('add-notification'), 'Settings saved successfully!', 'success');
        }
    });

    // Show scan button and preview when file selected
    const filePreviewContainer = document.getElementById('file-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const pdfPreview = document.getElementById('pdf-preview');

    receiptFileInput.addEventListener('change', (e) => {
        if (imagePreview.src) URL.revokeObjectURL(imagePreview.src);
        if (pdfPreview.src) URL.revokeObjectURL(pdfPreview.src);

        const file = e.target.files[0];
        if (file) {
            scanBtn.classList.remove('hidden');
            filePreviewContainer.classList.remove('hidden');

            const fileURL = URL.createObjectURL(file);

            if (file.type === 'application/pdf') {
                imagePreview.classList.add('hidden');
                pdfPreview.classList.remove('hidden');
                pdfPreview.src = fileURL;
            } else if (file.type.startsWith('image/')) {
                pdfPreview.classList.add('hidden');
                imagePreview.classList.remove('hidden');
                imagePreview.src = fileURL;
            } else {
                filePreviewContainer.classList.add('hidden');
            }
        } else {
            scanBtn.classList.add('hidden');
            filePreviewContainer.classList.add('hidden');
            imagePreview.classList.add('hidden');
            pdfPreview.classList.add('hidden');
            imagePreview.src = "";
            pdfPreview.src = "";
        }
    });

    // Compress Image or Extract PDF First Page Function
    async function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.8) {
        if (file.type === 'application/pdf') {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsArrayBuffer(file);
                reader.onload = async (event) => {
                    try {
                        const pdfjsLib = window['pdfjs-dist/build/pdf'];
                        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                        const loadingTask = pdfjsLib.getDocument({ data: event.target.result });
                        const pdf = await loadingTask.promise;
                        const page = await pdf.getPage(1);
                        const viewport = page.getViewport({ scale: 1.5 }); // Scale up for better OCR

                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.height = viewport.height;
                        canvas.width = viewport.width;

                        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                        // Resize if too large
                        let finalWidth = canvas.width;
                        let finalHeight = canvas.height;
                        let resultBase64 = "";

                        if (finalWidth > maxWidth || finalHeight > maxHeight) {
                            if (finalWidth > finalHeight) {
                                finalHeight = Math.round(finalHeight * maxWidth / finalWidth);
                                finalWidth = maxWidth;
                            } else {
                                finalWidth = Math.round(finalWidth * maxHeight / finalHeight);
                                finalHeight = maxHeight;
                            }
                            const resizedCanvas = document.createElement('canvas');
                            resizedCanvas.width = finalWidth;
                            resizedCanvas.height = finalHeight;
                            const resCtx = resizedCanvas.getContext('2d');
                            resCtx.drawImage(canvas, 0, 0, finalWidth, finalHeight);
                            resultBase64 = resizedCanvas.toDataURL('image/jpeg', quality);
                        } else {
                            resultBase64 = canvas.toDataURL('image/jpeg', quality);
                        }

                        // Prevent memory leak
                        try {
                            if (page) page.cleanup();
                            if (pdf) await pdf.destroy();
                        } catch (e) {
                            console.warn("Failed to cleanup PDF memory", e);
                        }

                        resolve(resultBase64);
                    } catch (err) {
                        reject(new Error("Failed to parse PDF document"));
                    }
                };
                reader.onerror = () => reject(new Error("Failed to read PDF file"));
            });
        } else {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = event => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = () => {
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > maxWidth) {
                                height = Math.round(height * maxWidth / width);
                                width = maxWidth;
                            }
                        } else {
                            if (height > maxHeight) {
                                width = Math.round(width * maxHeight / height);
                                height = maxHeight;
                            }
                        }

                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                    img.onerror = () => reject(new Error("Invalid image format"));
                };
                reader.onerror = () => reject(new Error("Failed to read file"));
            });
        }
    }

    // Perform Scan
    scanBtn.addEventListener('click', async () => {
        const key = localStorage.getItem('gemini_api_key');
        if (!key) {
            settingsModal.classList.remove('hidden');
            return;
        }

        const file = receiptFileInput.files[0];
        if (!file) return;

        scanBtn.disabled = true;
        scanBtnText.textContent = 'Scanning...';
        scanSpinner.classList.remove('hidden');

        try {
            const base64Image = await compressImage(file);
            const base64Data = base64Image.split(',')[1]; // remove prefix

            const categories = Array.from(document.getElementById('Category').options)
                .map(o => o.value)
                .filter(v => v);
            const currencies = Array.from(document.getElementById('Curr').options)
                .map(o => o.value);

            const prompt = `Analyze this receipt. Return a pure JSON object (no markdown formatting, no code blocks) with the following exact keys:
            - "Vendor": (string) the name of the store or vendor.
            - "Date": (string) date in YYYY-MM-DD format.
            - "Amount": (number) the total amount paid.
            - "Currency": (string) the 3-letter currency code (e.g. USD, THB) matching one from this list: [${currencies.join(', ')}]. Default to THB if unsure.
            - "Category": (string) pick the closest category from this exact list: [${categories.join(', ')}]. If none match well, leave empty string.
            - "Description": (string) a very short 2-4 word description of what was bought based on items.`;

            // Dynamically fetch available models to prevent "Model not found" errors on newer API keys
            const modelsResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (!modelsResponse.ok) {
                throw new Error("Invalid API key or network error.");
            }
            const modelsData = await modelsResponse.json();

            let targetModel = "gemini-1.5-flash"; // default fallback
            if (modelsData.models) {
                const availableModels = modelsData.models.filter(m =>
                    m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
                );
                // Prefer a 'flash' model as it's fast and cheap, otherwise use the first available
                const flashModel = availableModels.find(m => m.name.includes('flash'));
                if (flashModel) {
                    targetModel = flashModel.name.replace('models/', '');
                } else if (availableModels.length > 0) {
                    targetModel = availableModels[0].name.replace('models/', '');
                }
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${key}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: "image/jpeg",
                                    data: base64Data
                                }
                            }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        response_mime_type: "application/json"
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error?.message || "API request failed");
            }

            const data = await response.json();
            const contentStr = data.candidates[0].content.parts[0].text.trim();
            const cleanJsonStr = contentStr.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
            const extracted = JSON.parse(cleanJsonStr);

            if (extracted.Vendor) {
                document.getElementById('Vendor').value = extracted.Vendor;
                showSuggestions(); // to trigger auto-fill if it matches history
            }
            if (extracted.Amount) document.getElementById('AmountOrig').value = extracted.Amount;
            if (extracted.Currency && currencies.includes(extracted.Currency.toUpperCase())) {
                document.getElementById('Curr').value = extracted.Currency.toUpperCase();
            }
            if (extracted.Date) {
                fp.setDate(extracted.Date);
            }
            if (extracted.Description && !document.getElementById('Description').value) {
                document.getElementById('Description').value = extracted.Description;
            }
            if (extracted.Category && categories.includes(extracted.Category)) {
                document.getElementById('Category').value = extracted.Category;
            }

            showNotification(document.getElementById('add-notification'), 'Receipt scanned successfully!', 'success');

        } catch (error) {
            console.error("Scan error:", error);
            alert("Failed to scan receipt: " + error.message);
        } finally {
            scanBtn.disabled = false;
            scanBtnText.textContent = '✨ Scan';
            scanSpinner.classList.add('hidden');
        }
    });

    // Delete Modal Logic
    const deleteModal = document.getElementById('delete-modal');
    document.getElementById('cancel-delete-btn').addEventListener('click', () => {
        deleteModal.classList.add('hidden');
    });

    document.getElementById('confirm-delete-btn').addEventListener('click', () => {
        if (window.currentRowToDelete && window.currentBtnToDelete) {
            deleteModal.classList.add('hidden');
            deleteTransaction(window.currentRowToDelete, window.currentBtnToDelete);
        }
    });
});
