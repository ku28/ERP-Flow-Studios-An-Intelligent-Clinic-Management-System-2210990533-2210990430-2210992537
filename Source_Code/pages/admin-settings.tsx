import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import * as XLSX from 'xlsx';
import Layout from '../components/Layout';
import CustomSelect from '../components/CustomSelect';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import ToastNotification from '../components/ToastNotification';
import { isBasicPlan } from '../lib/subscription';

// Types
interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: string;
    lastLogin?: string;
}

interface SystemStats {
    totalUsers: number;
    totalPatients: number;
    totalProducts: number;
    totalVisits: number;
    totalPrescriptions: number;
    totalPurchaseOrders: number;
}

interface AuditLog {
    id: string;
    userId: string;
    userName: string;
    action: string;
    entity: string;
    timestamp: string;
    details?: string;
}

interface Backup {
    id: string;
    filename: string;
    size: string;
    createdAt: string;
}

interface DropdownFile {
    name: string;
    path: string;
    itemCount: number;
}

interface DropdownItem {
    id?: string;
    name?: string;
    label?: string;
    value?: string;
    [key: string]: any;
}

export default function AdminSettingsPage() {
    const router = useRouter();

    // Active tab state
    const [activeTab, setActiveTab] = useState('users');

    // Loading states
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [clearingSessions, setClearingSessions] = useState(false);

    // Current user
    const [currentUser, setCurrentUser] = useState<User | null>(null);

    // User Management states
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [userAction, setUserAction] = useState<'changeRole' | 'resetPassword' | 'expireSession' | 'delete' | null>(null);
    const [newRole, setNewRole] = useState('');

    // Data Management states
    const [dataCounts, setDataCounts] = useState<Record<string, number>>({});
    const [selectedTables, setSelectedTables] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [resetModalState, setResetModalState] = useState<'confirm' | 'progress' | 'success'>('confirm');
    const [resetProgress, setResetProgress] = useState({ current: 0, total: 0, currentTable: '' });
    const [confirmationText, setConfirmationText] = useState('');
    const [abortResetController, setAbortResetController] = useState<AbortController | null>(null);

    // System & Stats states
    const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
    const [exportFormat, setExportFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');

    // Activity Logs states
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [logSearch, setLogSearch] = useState('');
    const [logFilterAction, setLogFilterAction] = useState('all');
    const [logFilterEntity, setLogFilterEntity] = useState('all');

    // Backup & Export states
    const [backups, setBackups] = useState<Backup[]>([]);
    const [exportTable, setExportTable] = useState('users');
    const [exportDataFormat, setExportDataFormat] = useState<'csv' | 'json' | 'xlsx'>('csv');

    // Dropdown Options states
    const [dropdownFiles, setDropdownFiles] = useState<DropdownFile[]>([]);
    const [selectedDropdownFile, setSelectedDropdownFile] = useState<string | null>(null);
    const [dropdownItems, setDropdownItems] = useState<DropdownItem[]>([]);
    const [editingDropdownItem, setEditingDropdownItem] = useState<DropdownItem | null>(null);
    const [newDropdownItem, setNewDropdownItem] = useState<Partial<DropdownItem>>({});
    const [showDropdownItemModal, setShowDropdownItemModal] = useState(false);
    const [dropdownModalMode, setDropdownModalMode] = useState<'add' | 'edit'>('add');
    const [selectedDropdownItems, setSelectedDropdownItems] = useState<number[]>([]);
    const [itemToDelete, setItemToDelete] = useState<DropdownItem | null>(null);
    const [showDropdownDeleteModal, setShowDropdownDeleteModal] = useState(false);
    const [dropdownDeleteStep, setDropdownDeleteStep] = useState<1 | 2>(1);
    const [showDropdownImportModal, setShowDropdownImportModal] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showDeleteAllMenu, setShowDeleteAllMenu] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importParsedData, setImportParsedData] = useState<DropdownItem[]>([]);
    const [importStep, setImportStep] = useState<'select' | 'preview' | 'checking' | 'confirm' | 'importing' | 'success'>('select');
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
    const [importDuplicateIndices, setImportDuplicateIndices] = useState<number[]>([]);
    const [importUniqueCount, setImportUniqueCount] = useState(0);
    const [importDuplicateCount, setImportDuplicateCount] = useState(0);
    const [importSummary, setImportSummary] = useState({ success: 0, errors: 0, updated: 0 });
    const [loadingDropdownItems, setLoadingDropdownItems] = useState(false);
    const [showRenameModal, setShowRenameModal] = useState(false);
    const [renamingFile, setRenamingFile] = useState<string | null>(null);
    const [newFileName, setNewFileName] = useState('');
    const [fileDisplayNames, setFileDisplayNames] = useState<Record<string, string>>({});
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [deleteConfirmStep, setDeleteConfirmStep] = useState<1 | 2>(1);
    const [deleteMode, setDeleteMode] = useState<'selected' | 'all' | 'single' | null>(null);
    const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 });
    const [deletingSummary, setDeletingSummary] = useState({ success: 0, errors: 0 });

    // Product Mapping states
    const [productMappings, setProductMappings] = useState<any[]>([]);
    const [mappingSearch, setMappingSearch] = useState('');
    const [selectedMapping, setSelectedMapping] = useState<any | null>(null);
    const [showDeleteMappingModal, setShowDeleteMappingModal] = useState(false);
    const [mappingDeleteStep, setMappingDeleteStep] = useState<1 | 2>(1);
    const [allProductsForMapping, setAllProductsForMapping] = useState<any[]>([]);
    const [selectedMappingIds, setSelectedMappingIds] = useState<Set<number>>(new Set());
    const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);

    // Default Values states
    const [defaultValuePages, setDefaultValuePages] = useState<any[]>([]);
    const [selectedDefaultPage, setSelectedDefaultPage] = useState<string | null>(null);
    const [defaultValues, setDefaultValues] = useState<Record<string, any>>({});
    const [editingDefaultValues, setEditingDefaultValues] = useState<Record<string, any>>({});
    const [showDefaultValuesModal, setShowDefaultValuesModal] = useState(false);
    const [loadingDefaultValues, setLoadingDefaultValues] = useState(false);

    // Toast notifications
    const { toasts, removeToast, showSuccess, showError, showWarning, showInfo } = useToast();

    // Current user from AuthContext
    const { user: authUser, loading: authLoading } = useAuth();

    // Sync AuthContext user into local state and perform role/plan checks
    useEffect(() => {
        if (authLoading) return;
        if (!authUser) {
            router.push('/login');
            return;
        }
        if (isBasicPlan(authUser?.clinic?.subscriptionPlan)) {
            router.push('/upgrade');
            return;
        }
        if (authUser.role !== 'admin') {
            router.push('/dashboard');
            return;
        }
        setCurrentUser(authUser as any);
    }, [authUser, authLoading]);

    // Fetch users
    const fetchUsers = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/admin/users');
            if (response.ok) {
                const data = await response.json();
                setUsers(data.users);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'users' && currentUser?.role === 'admin') {
            fetchUsers();
        }
    }, [activeTab, currentUser]);

    // Fetch data counts
    const fetchDataCounts = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/admin/data-counts');
            if (response.ok) {
                const data = await response.json();
                setDataCounts(data.counts);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'data' && currentUser?.role === 'admin') {
            fetchDataCounts();
        }
    }, [activeTab, currentUser]);

    // Fetch system stats
    const fetchSystemStats = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/admin/system-stats');
            if (response.ok) {
                const data = await response.json();
                setSystemStats(data.stats);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'stats' && currentUser?.role === 'admin') {
            fetchSystemStats();
        }
    }, [activeTab, currentUser]);

    // Fetch audit logs
    const fetchAuditLogs = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/admin/audit-logs');
            if (response.ok) {
                const data = await response.json();
                setAuditLogs(data.logs);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'logs' && currentUser?.role === 'admin') {
            fetchAuditLogs();
        }
    }, [activeTab, currentUser]);

    // Fetch backups
    const fetchBackups = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/admin/backups');
            if (response.ok) {
                const data = await response.json();
                setBackups(data.backups);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'backup' && currentUser?.role === 'admin') {
            fetchBackups();
        }
    }, [activeTab, currentUser]);

    // Fetch dropdown files
    const fetchDropdownFiles = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/admin/dropdown-files');
            if (response.ok) {
                const data = await response.json();
                setDropdownFiles(data.files);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'dropdowns' && currentUser?.role === 'admin') {
            fetchDropdownFiles();
        }
    }, [activeTab, currentUser]);

    // Populate dropdown options with defaults from JSON files
    const [populatingDefaults, setPopulatingDefaults] = useState(false);
    const [showPopulateModal, setShowPopulateModal] = useState(false);
    const [populateResults, setPopulateResults] = useState<any>(null);

    const handlePopulateWithDefaults = async () => {
        setPopulatingDefaults(true);
        try {
            const response = await fetch('/api/admin/populate-defaults', {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                setPopulateResults(data);
                setShowPopulateModal(true);
                // Refresh the dropdown files list to show updated counts
                await fetchDropdownFiles();
                if (selectedDropdownFile) {
                    await handleSelectDropdownFile(selectedDropdownFile);
                }
            } else {
                const errorData = await response.json();
                alert(`Error: ${errorData.error || 'Failed to populate defaults'}`);
            }
        } catch (error) {
            alert('Failed to populate defaults. Please try again.');
        } finally {
            setPopulatingDefaults(false);
        }
    };

    // Fetch product mappings
    const fetchProductMappings = async () => {
        setRefreshing(true);
        try {
            const [mappingsRes, productsRes] = await Promise.all([
                fetch('/api/product-mappings'),
                fetch('/api/products')
            ]);
            if (mappingsRes.ok) {
                const data = await mappingsRes.json();
                setProductMappings(data.mappings || []);
            }
            if (productsRes.ok) {
                const data = await productsRes.json();
                setAllProductsForMapping(data || []);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'mappings' && currentUser?.role === 'admin') {
            fetchProductMappings();
        }
    }, [activeTab, currentUser]);

    // Fetch default values pages
    const fetchDefaultValuePages = async () => {
        setRefreshing(true);
        try {
            const response = await fetch('/api/admin/default-values');
            if (response.ok) {
                const data = await response.json();
                setDefaultValuePages(data.pages || []);
            }
        } catch (error) {
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'defaults' && currentUser?.role === 'admin') {
            fetchDefaultValuePages();
        }
    }, [activeTab, currentUser]);

    // Select default value page and load its values
    const selectDefaultValuePage = (page: any) => {
        setSelectedDefaultPage(page.page);
        setDefaultValues(page.values || {});
        setEditingDefaultValues(page.values || {});
    };

    // Handle save default values
    const handleSaveDefaultValues = async () => {
        if (!selectedDefaultPage) return;

        setLoading(true);
        try {
            const response = await fetch('/api/admin/default-values', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page: selectedDefaultPage,
                    values: editingDefaultValues,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                showSuccess('Default values updated successfully');
                setDefaultValues(editingDefaultValues);
                fetchDefaultValuePages();
                setShowDefaultValuesModal(false);
            } else {
                const error = await response.json();
                showError(error.error || 'Failed to update default values');
            }
        } catch (error) {
            showError('An error occurred while saving');
        } finally {
            setLoading(false);
        }
    };

    // Fetch dropdown items when file is selected
    useEffect(() => {
        if (selectedDropdownFile) {
            fetchDropdownItems();
        }
    }, [selectedDropdownFile]);

    const fetchDropdownItems = async () => {
        if (!selectedDropdownFile) return;
        setLoadingDropdownItems(true);
        try {
            const response = await fetch(`/api/admin/dropdown-data?file=${selectedDropdownFile}`);
            if (response.ok) {
                const result = await response.json();
                setDropdownItems(result.data || []);
            }
        } catch (error) {
        } finally {
            setLoadingDropdownItems(false);
        }
    };

    // User action handlers
    const handleUserAction = async () => {
        if (!selectedUser || !userAction) return;

        setLoading(true);
        try {
            let endpoint = '';
            let method = 'POST';
            let body: any = { userId: selectedUser.id };

            switch (userAction) {
                case 'changeRole':
                    endpoint = '/api/admin/change-role';
                    body.role = newRole;
                    break;
                case 'resetPassword':
                    endpoint = '/api/admin/reset-user-password';
                    break;
                case 'expireSession':
                    endpoint = '/api/admin/expire-session';
                    break;
                case 'delete':
                    endpoint = '/api/admin/delete-user';
                    method = 'DELETE';
                    break;
            }

            const response = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                const data = await response.json();
                showSuccess(data.message || 'Action completed successfully');
                fetchUsers();
                setSelectedUser(null);
                setUserAction(null);
                setNewRole('');
            } else {
                const error = await response.json();
                showError(error.error || 'Action failed');
            }
        } catch (error) {
            showError('An error occurred while performing action');
        } finally {
            setLoading(false);
        }
    };

    // Data reset handler with progress tracking
    const handleDeleteData = async () => {
        if (selectedTables.length === 0) return;

        // Transition to progress modal
        setResetModalState('progress');
        setLoading(true);
        
        // Create abort controller for cancellation
        const controller = new AbortController();
        setAbortResetController(controller);

        try {
            const isResetAll = selectedTables.length > 10;
            const totalSteps = isResetAll ? selectedTables.length + 1 : selectedTables.length;
            let currentStep = 0;

            // Step 1: Clean up Cloudinary if resetting all
            if (isResetAll) {
                setResetProgress({ current: currentStep, total: totalSteps, currentTable: 'Cloudinary Files' });
                
                if (controller.signal.aborted) throw new Error('Operation cancelled');
                
                try {
                    await fetch('/api/admin/cleanup-cloudinary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        signal: controller.signal
                    });
                    currentStep++;
                } catch (cleanupError: any) {
                    if (cleanupError.name === 'AbortError') throw new Error('Operation cancelled');
                }
            }

            // Step 2: Reset database tables
            setResetProgress({ current: currentStep, total: totalSteps, currentTable: 'Database Tables' });
            
            if (controller.signal.aborted) throw new Error('Operation cancelled');

            const response = await fetch('/api/admin/delete-data', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tables: selectedTables }),
                signal: controller.signal
            });

            if (controller.signal.aborted) throw new Error('Operation cancelled');

            if (response.ok) {
                const data = await response.json();
                
                // Show success modal
                setResetProgress({ current: totalSteps, total: totalSteps, currentTable: 'Complete' });
                setResetModalState('success');
                
                // Refresh counts
                await fetchDataCounts();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Reset failed');
            }
        } catch (error: any) {
            
            if (error.message === 'Operation cancelled') {
                showWarning('Reset operation cancelled');
            } else {
                showError(error.message || 'An error occurred while resetting data');
            }
            
            // Close modal on error
            setShowDeleteConfirm(false);
            setResetModalState('confirm');
        } finally {
            setLoading(false);
            setAbortResetController(null);
        }
    };

    // Cancel reset operation
    const handleCancelReset = () => {
        if (abortResetController) {
            abortResetController.abort();
        }
        setShowDeleteConfirm(false);
        setResetModalState('confirm');
        setConfirmationText('');
        setResetProgress({ current: 0, total: 0, currentTable: '' });
    };

    // Close success modal and reset state
    const handleCloseSuccessModal = () => {
        setShowDeleteConfirm(false);
        setResetModalState('confirm');
        setSelectedTables([]);
        setConfirmationText('');
        setResetProgress({ current: 0, total: 0, currentTable: '' });
    };

    // Bulk user import handler
    const handleImportUsers = async () => {
        if (!importFile) return;

        setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', importFile);

            const response = await fetch('/api/admin/import-users', {
                method: 'POST',
                body: formData,
            });

            if (response.ok) {
                const data = await response.json();
                showSuccess(data.message || 'Users imported successfully');
                setImportFile(null);
            } else {
                const error = await response.json();
                showError(error.error || 'Import failed');
            }
        } catch (error) {
            showError('An error occurred during import');
        } finally {
            setLoading(false);
        }
    };

    // User export handler
    const handleExportUsers = async () => {
        try {
            const response = await fetch(`/api/admin/export-users?format=${exportFormat}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `users.${exportFormat}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                showError('Export failed');
            }
        } catch (error) {
            showError('An error occurred during export');
        }
    };

    // Backup creation handler
    const handleCreateBackup = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/admin/create-backup', {
                method: 'POST',
            });

            if (response.ok) {
                const data = await response.json();
                alert(data.message);
                fetchBackups();
            } else {
                const error = await response.json();
                alert(error.error || 'Backup creation failed');
            }
        } catch (error) {
            alert('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    // Data export handler
    const handleExportData = async () => {
        try {
            const response = await fetch(`/api/admin/export-data?table=${exportTable}&format=${exportDataFormat}`);
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${exportTable}.${exportDataFormat}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            } else {
                showError('Export failed');
            }
        } catch (error) {
            showError('An error occurred during export');
        }
    };

    // Dropdown item handlers
    const handleAddDropdownItem = () => {
        setDropdownModalMode('add');
        setNewDropdownItem({});
        setEditingDropdownItem(null);
        setShowDropdownItemModal(true);
    };

    const handleEditDropdownItem = (item: DropdownItem) => {
        setDropdownModalMode('edit');
        setEditingDropdownItem(item);
        setNewDropdownItem(item);
        setShowDropdownItemModal(true);
    };

    const handleSaveDropdownItem = async () => {
        if (!selectedDropdownFile) return;

        setLoading(true);
        try {
            const method = dropdownModalMode === 'add' ? 'POST' : 'PUT';
            const body: any = {
                file: selectedDropdownFile,
                item: newDropdownItem,
            };
            
            // For PUT request, send oldValue to identify the item to update
            if (method === 'PUT' && editingDropdownItem) {
                body.oldValue = editingDropdownItem.value;
            }

            const response = await fetch('/api/admin/dropdown-data', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (response.ok) {
                const data = await response.json();
                showSuccess(data.message || `Item ${dropdownModalMode === 'add' ? 'added' : 'updated'} successfully`);
                fetchDropdownItems();
                setShowDropdownItemModal(false);
                setNewDropdownItem({});
                setEditingDropdownItem(null);
            } else {
                const error = await response.json();
                showError(error.error || 'Save failed');
            }
        } catch (error) {
            showError('An error occurred while saving');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDropdownItem = (item: DropdownItem) => {
        setItemToDelete(item);
        setDeleteMode('single');
        setDeleteConfirmStep(1);
        setShowDeleteConfirmModal(true);
    };

    const confirmDeleteDropdownItem = async () => {
        if (!selectedDropdownFile || !itemToDelete) return;

        setLoading(true);
        try {
            const response = await fetch('/api/admin/dropdown-data', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: selectedDropdownFile,
                    value: itemToDelete.value,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                showSuccess(data.message || 'Item deleted successfully');
                fetchDropdownItems();
                setShowDropdownDeleteModal(false);
                setItemToDelete(null);
            } else {
                const error = await response.json();
                showError(error.error || 'Delete failed');
            }
        } catch (error) {
            showError('An error occurred while deleting');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSelectedDropdownItems = () => {
        if (!selectedDropdownFile || selectedDropdownItems.length === 0) return;
        setDeleteMode('selected');
        setDeleteConfirmStep(1);
        setShowDeleteConfirmModal(true);
    };

    const OLD_handleDeleteSelectedDropdownItems = async () => {
        if (!selectedDropdownFile || selectedDropdownItems.length === 0) return;

        const count = selectedDropdownItems.length;
        if (!window.confirm(`Are you sure you want to delete ${count} selected items?`)) return;

        setLoading(true);
        try {
            let successCount = 0;
            let errorCount = 0;
            
            for (const index of selectedDropdownItems) {
                const item = dropdownItems[index];
                try {
                    const response = await fetch('/api/admin/dropdown-data', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            file: selectedDropdownFile,
                            value: item.value,
                        }),
                    });
                    if (response.ok) {
                        successCount++;
                    } else {
                        errorCount++;
                    }
                } catch {
                    errorCount++;
                }
            }
            
            if (successCount > 0) {
                showSuccess(`Successfully deleted ${successCount} item${successCount > 1 ? 's' : ''}`);
            }
            if (errorCount > 0) {
                showError(`Failed to delete ${errorCount} item${errorCount > 1 ? 's' : ''}`);
            }
            
            setSelectedDropdownItems([]);
            fetchDropdownItems();
        } catch (error) {
            showError('An error occurred while deleting items');
        } finally {
            setLoading(false);
        }
    };

    const handleImportDropdownData = () => {
        if (!selectedDropdownFile) {
            showError('Please select a dropdown file first');
            return;
        }
        setShowDropdownImportModal(true);
    };

    const handleExportDropdownData = (format: 'csv' | 'xlsx' | 'json') => {
        if (!selectedDropdownFile || !dropdownItems || dropdownItems.length === 0) {
            showError('No data to export');
            return;
        }

        try {
            // Export selected items if any are selected, otherwise export all
            const dataToExport = selectedDropdownItems.length > 0 
                ? selectedDropdownItems.map(index => dropdownItems[index])
                : dropdownItems;

            const fileName = `${selectedDropdownFile.replace('.json', '')}_${selectedDropdownItems.length > 0 ? 'selected_' : ''}${new Date().toISOString().split('T')[0]}`;
            
            if (format === 'json') {
                const dataStr = JSON.stringify(dataToExport, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${fileName}.json`;
                link.click();
                URL.revokeObjectURL(url);
            } else if (format === 'csv') {
                const worksheet = XLSX.utils.json_to_sheet(dataToExport);
                const csv = XLSX.utils.sheet_to_csv(worksheet);
                const dataBlob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(dataBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${fileName}.csv`;
                link.click();
                URL.revokeObjectURL(url);
            } else if (format === 'xlsx') {
                const worksheet = XLSX.utils.json_to_sheet(dataToExport);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
                XLSX.writeFile(workbook, `${fileName}.xlsx`);
            }
            
            const itemCount = selectedDropdownItems.length > 0 ? selectedDropdownItems.length : dropdownItems.length;
            showSuccess(`${itemCount} item${itemCount > 1 ? 's' : ''} exported successfully as ${format.toUpperCase()}`);
            setShowExportMenu(false);
        } catch (error) {
            showError('Failed to export data');
        }
    };

    const handleDeleteAllDropdownItems = () => {
        if (!selectedDropdownFile || !dropdownItems || dropdownItems.length === 0) {
            showError('No items to delete');
            return;
        }
        setDeleteMode('all');
        setDeleteConfirmStep(1);
        setShowDeleteConfirmModal(true);
    };

    const handleRenameFile = (fileName: string) => {
        setRenamingFile(fileName);
        setNewFileName(fileDisplayNames[fileName] || fileName);
        setShowRenameModal(true);
    };

    const handleSaveRename = () => {
        if (renamingFile && newFileName.trim()) {
            setFileDisplayNames(prev => ({
                ...prev,
                [renamingFile]: newFileName.trim()
            }));
            setShowRenameModal(false);
            setRenamingFile(null);
            setNewFileName('');
            showSuccess('File display name updated successfully');
        }
    };

    const handleSelectDropdownFile = (fileName: string) => {
        setSelectedDropdownFile(fileName);
    };

    const handleBackToFiles = () => {
        setSelectedDropdownFile(null);
        setSelectedDropdownItems([]);
        setDropdownItems([]);
    };

    const executeDelete = async () => {
        if (!selectedDropdownFile) return;

        let itemsToDelete: DropdownItem[] = [];
        
        if (deleteMode === 'single' && itemToDelete) {
            itemsToDelete = [itemToDelete];
        } else if (deleteMode === 'selected') {
            itemsToDelete = selectedDropdownItems.map(index => dropdownItems[index]);
        } else if (deleteMode === 'all') {
            itemsToDelete = dropdownItems;
        }

        setDeleteProgress({ current: 0, total: itemsToDelete.length });
        setDeletingSummary({ success: 0, errors: 0 });
        
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < itemsToDelete.length; i++) {
            const item = itemsToDelete[i];
            try {
                const response = await fetch('/api/admin/dropdown-data', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: selectedDropdownFile,
                        value: item.value,
                    }),
                });
                if (response.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch {
                errorCount++;
            }
            setDeleteProgress({ current: i + 1, total: itemsToDelete.length });
            setDeletingSummary({ success: successCount, errors: errorCount });
        }
        
        // Wait a bit to show final state
        await new Promise(resolve => setTimeout(resolve, 800));
        
        if (successCount > 0) {
            showSuccess(`Successfully deleted ${successCount} item${successCount > 1 ? 's' : ''}`);
        }
        if (errorCount > 0) {
            showError(`Failed to delete ${errorCount} item${errorCount > 1 ? 's' : ''}`);
        }
        
        setSelectedDropdownItems([]);
        setShowDeleteConfirmModal(false);
        setDeleteConfirmStep(1);
        setShowDeleteAllMenu(false);
        setItemToDelete(null);
        setShowDropdownDeleteModal(false);
        setDropdownDeleteStep(1);
        fetchDropdownItems();
    };

    const handleFileImport = async (file: File) => {
        if (!selectedDropdownFile) {
            showError('Please select a dropdown file first');
            return;
        }

        setImportFile(file);
        setLoading(true);
        try {
            const fileExtension = file.name.split('.').pop()?.toLowerCase();
            let parsedData: any[] = [];

            if (fileExtension === 'json') {
                const text = await file.text();
                const jsonData = JSON.parse(text);
                parsedData = Array.isArray(jsonData) ? jsonData : [jsonData];
            } else if (fileExtension === 'csv' || fileExtension === 'xlsx' || fileExtension === 'xls') {
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                parsedData = XLSX.utils.sheet_to_json(firstSheet);
            } else {
                showError('Unsupported file format. Please use CSV, XLSX, or JSON');
                setLoading(false);
                return;
            }

            if (!Array.isArray(parsedData) || parsedData.length === 0) {
                showError('No valid data found in file');
                setLoading(false);
                return;
            }

            setImportParsedData(parsedData);
            setImportStep('preview');
            setLoading(false);
        } catch (error) {
            showError('Failed to parse file. Please check the file format.');
            setLoading(false);
        }
    };

    const checkDropdownDuplicates = async () => {
        setImportStep('checking');
        setLoading(true);

        try {
            // Check for duplicates based on 'value' field
            const existingValues = new Set(dropdownItems.map(item => item.value));
            const duplicateIndices: number[] = [];
            const uniqueIndices: number[] = [];

            importParsedData.forEach((item, index) => {
                if (existingValues.has(item.value)) {
                    duplicateIndices.push(index);
                } else {
                    uniqueIndices.push(index);
                }
            });

            setImportDuplicateIndices(duplicateIndices);
            setImportDuplicateCount(duplicateIndices.length);
            setImportUniqueCount(uniqueIndices.length);
            setImportStep('confirm');
            setLoading(false);
        } catch (error) {
            showError('Failed to check for duplicates');
            setImportStep('preview');
            setLoading(false);
        }
    };

    const handleConfirmImport = async (action: 'skip' | 'update' | 'all') => {
        setImportStep('importing');
        setLoading(true);

        try {
            let dataToImport: DropdownItem[] = [];
            let shouldUpdate = false;

            if (action === 'skip') {
                // Import only unique items
                dataToImport = importParsedData.filter((_, index) => !importDuplicateIndices.includes(index));
                shouldUpdate = false;
            } else if (action === 'update') {
                // Update duplicates and add unique
                dataToImport = importParsedData;
                shouldUpdate = true;
            } else {
                // Import all (duplicates will be updated)
                dataToImport = importParsedData;
                shouldUpdate = true;
            }

            const total = dataToImport.length;
            setImportProgress({ current: 0, total });

            let successCount = 0;
            let errorCount = 0;
            let updatedCount = 0;

            for (let i = 0; i < dataToImport.length; i++) {
                const item = dataToImport[i];
                const isDuplicate = importDuplicateIndices.includes(importParsedData.indexOf(item));

                try {
                    if (isDuplicate && shouldUpdate) {
                        // Update existing item
                        const response = await fetch('/api/admin/dropdown-data', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                file: selectedDropdownFile,
                                item: item,
                                oldValue: item.value,
                            }),
                        });

                        if (response.ok) {
                            updatedCount++;
                        } else {
                            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                            errorCount++;
                        }
                    } else if (!isDuplicate) {
                        // Add new item
                        const response = await fetch('/api/admin/dropdown-data', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                file: selectedDropdownFile,
                                item: item,
                            }),
                        });

                        if (response.ok) {
                            successCount++;
                        } else {
                            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                            errorCount++;
                        }
                    }
                } catch (error) {
                    errorCount++;
                }

                setImportProgress({ current: i + 1, total });
            }

            setImportSummary({ success: successCount, errors: errorCount, updated: updatedCount });
            setImportStep('success');
            fetchDropdownItems();
        } catch (error) {
            showError('Failed to import data');
            setImportStep('confirm');
        } finally {
            setLoading(false);
        }
    };

    const resetImportModal = () => {
        setImportFile(null);
        setImportParsedData([]);
        setImportStep('select');
        setImportProgress({ current: 0, total: 0 });
        setImportDuplicateIndices([]);
        setImportUniqueCount(0);
        setImportDuplicateCount(0);
        setImportSummary({ success: 0, errors: 0, updated: 0 });
    };

    const toggleSelectAllDropdownItems = () => {
        if (selectedDropdownItems.length === dropdownItems.length) {
            setSelectedDropdownItems([]);
        } else {
            setSelectedDropdownItems(dropdownItems.map((_, index) => index));
        }
    };

    // Sidebar items
    const sidebarItems = [
        { 
            id: 'users', 
            label: 'User Console', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        },
        { 
            id: 'data', 
            label: 'Data Hub', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
        },
        { 
            id: 'stats', 
            label: 'System & Stats', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
        },
        { 
            id: 'logs', 
            label: 'Activity Logs', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        },
        { 
            id: 'backup', 
            label: 'Backup & Export', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
        },
        { 
            id: 'dropdowns', 
            label: 'Dropdown Options', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        },
        { 
            id: 'defaults', 
            label: 'Default Values', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        },
        { 
            id: 'mappings', 
            label: 'Product Mapping', 
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
        },
    ];

    // Filter logs
    const filteredLogs = auditLogs.filter(log => {
        const matchesSearch = logSearch === '' ||
            log.userName.toLowerCase().includes(logSearch.toLowerCase()) ||
            log.action.toLowerCase().includes(logSearch.toLowerCase()) ||
            log.entity.toLowerCase().includes(logSearch.toLowerCase());

        const matchesAction = logFilterAction === 'all' || log.action === logFilterAction;
        const matchesEntity = logFilterEntity === 'all' || log.entity === logFilterEntity;

        return matchesSearch && matchesAction && matchesEntity;
    });

    if (!currentUser || currentUser.role !== 'admin') {
        return null;
    }

    return (
        <div className="container mx-auto px-4 py-4 sm:py-6 max-w-7xl">
            {/* Page Title - Mobile */}
            <div className="mb-4 md:hidden">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                    Admin Settings
                </h1>
            </div>

            {/* Mobile Horizontal Tabs */}
            <div className="md:hidden mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 min-w-max pb-2">
                    {sidebarItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap text-sm font-medium ${activeTab === item.id
                                    ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/30'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                }`}
                        >
                            <span className="text-base">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
                {/* Desktop Sidebar */}
                <div className="hidden md:block w-64 flex-shrink-0">
                    <div className="rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sticky top-24 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative mb-6">
                            <h1 className="text-xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                Admin Settings
                            </h1>
                        </div>
                        <nav className="space-y-1">
                            {sidebarItems.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${activeTab === item.id
                                            ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/30 font-medium'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-md text-gray-700 dark:text-gray-300'
                                        }`}
                                >
                                    <span className={activeTab === item.id ? 'text-white' : 'text-gray-600 dark:text-gray-400'}>{item.icon}</span>
                                    <span>{item.label}</span>
                                </button>
                            ))}
                        </nav>
                    </div>
                </div>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    {/* User Console Tab */}
                    {activeTab === 'users' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                        User Console
                                    </h2>
                                <div className="flex items-center gap-2">
                                    {/* Clear stale sessions (zombie cleanup) */}
                                    <button
                                        onClick={async () => {
                                            if (!confirm('Clear all stale/inactive sessions? Active users will NOT be affected.')) return;
                                            setClearingSessions(true);
                                            try {
                                                const res = await fetch('/api/admin/clear-sessions', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ staleOnly: true }),
                                                });
                                                const data = await res.json();
                                                alert(data.message || 'Done');
                                            } catch {
                                                alert('Failed to clear sessions');
                                            } finally {
                                                setClearingSessions(false);
                                            }
                                        }}
                                        disabled={clearingSessions}
                                        title="Clear zombie/stale sessions that are causing false session-limit errors"
                                        className="flex items-center gap-1.5 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded-lg font-medium transition-colors text-sm disabled:opacity-50"
                                    >
                                        {clearingSessions ? (
                                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-25" /><path strokeWidth="3" d="M12 2a10 10 0 0 1 10 10" /></svg>
                                        ) : (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        )}
                                        Clear Stale Sessions
                                    </button>
                                    <button
                                        onClick={fetchUsers}
                                        disabled={refreshing}
                                        className="bg-gradient-to-r from-sky-500 to-sky-600 text-white p-2 rounded-lg hover:shadow-lg shadow-sky-500/30 transition-all disabled:opacity-50"
                                        title="Refresh users"
                                    >
                                        <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {users.map(user => (
                                        <div key={user.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg transition-shadow">
                                            <div className="flex flex-col space-y-3">
                                                <div>
                                                    <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{user.name}</h3>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">{user.email}</p>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${user.role === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                                                        user.role === 'doctor' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                                            'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                                        }`}>
                                                        {user.role}
                                                    </span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {new Date(user.createdAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 pt-2">
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setUserAction('changeRole');
                                                            setNewRole(user.role);
                                                        }}
                                                        className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg font-medium transition-colors text-sm"
                                                    >
                                                        Change Role
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setUserAction('resetPassword');
                                                        }}
                                                        className="px-3 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 rounded-lg font-medium transition-colors text-sm"
                                                    >
                                                        Reset Password
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setUserAction('expireSession');
                                                        }}
                                                        className="px-3 py-2 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 rounded-lg font-medium transition-colors text-sm"
                                                    >
                                                        Logout
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedUser(user);
                                                            setUserAction('delete');
                                                        }}
                                                        className="px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-lg font-medium transition-colors text-sm"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Data Hub Tab */}
                    {activeTab === 'data' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                        Data Hub
                                    </h2>
                                    <button
                                        onClick={fetchDataCounts}
                                        disabled={refreshing}
                                        className="bg-gradient-to-r from-sky-500 to-sky-600 text-white p-2 rounded-lg hover:shadow-lg shadow-sky-500/30 transition-all disabled:opacity-50"
                                        title="Refresh data"
                                    >
                                        <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>

                                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Select Data to Reset</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                                    {['patients', 'visits', 'prescriptions', 'products', 'categories', 'suppliers', 'purchaseOrders', 'invoices', 'payments', 'treatments', 'tokens', 'appointments', 'stockTransactions', 'productBatches', 'sales', 'purchases', 'productOrders', 'demandForecasts', 'tasks', 'customerInvoices'].map(table => {
                                        const hasData = dataCounts.hasOwnProperty(table);
                                        const count = dataCounts[table] || 0;
                                        return (
                                            <label key={table} className="relative cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTables.includes(table)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedTables([...selectedTables, table]);
                                                        } else {
                                                            setSelectedTables(selectedTables.filter(t => t !== table));
                                                        }
                                                    }}
                                                    className="peer sr-only"
                                                />
                                                <div className="bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 peer-checked:border-blue-500 peer-checked:bg-blue-50 dark:peer-checked:bg-blue-900/20 rounded-lg p-5 transition-all hover:shadow-md">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h4 className="text-base font-bold text-gray-900 dark:text-gray-100 capitalize">{table}</h4>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${selectedTables.includes(table) ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                                            {selectedTables.includes(table) && (
                                                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {refreshing ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                                            <span className="text-sm text-gray-500 dark:text-gray-400">Loading...</span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{count}</p>
                                                            <p className="text-sm text-gray-500 dark:text-gray-400">records</p>
                                                        </>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>

                                <div className="space-y-3">
                                    <button
                                        onClick={() => setShowDeleteConfirm(true)}
                                        disabled={selectedTables.length === 0}
                                        className="w-full px-4 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:shadow-lg shadow-orange-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg"
                                    >
                                        Reset Selected Data ({selectedTables.length} {selectedTables.length === 1 ? 'table' : 'tables'})
                                    </button>
                                    <button
                                        onClick={() => {
                                            const allTables = ['patients', 'visits', 'prescriptions', 'products', 'suppliers', 'purchaseOrders', 'invoices', 'payments', 'treatments', 'tokens', 'appointments', 'stockTransactions', 'categories', 'productBatches', 'sales', 'purchases', 'productOrders', 'demandForecasts', 'tasks', 'customerInvoices'];
                                            setSelectedTables(allTables);
                                            setShowDeleteConfirm(true);
                                        }}
                                        className="w-full px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:shadow-lg shadow-red-500/30 transition-all font-medium text-lg"
                                    >
                                        Reset All Data (Keep Users & Landing Page)
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* System & Stats Tab */}
                    {activeTab === 'stats' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                        System Statistics
                                    </h2>
                                    <button
                                        onClick={fetchSystemStats}
                                        disabled={refreshing}
                                        className="bg-gradient-to-r from-sky-500 to-sky-600 text-white p-2 rounded-lg hover:shadow-lg shadow-sky-500/30 transition-all disabled:opacity-50"
                                        title="Refresh stats"
                                    >
                                        <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>

                                {systemStats && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                                        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg p-6 text-white">
                                            <div className="text-sm opacity-90">Total Users</div>
                                            <div className="text-4xl font-bold mt-2">{systemStats.totalUsers}</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-blue-500 to-sky-600 rounded-xl shadow-lg p-6 text-white">
                                            <div className="text-sm opacity-90">Total Patients</div>
                                            <div className="text-4xl font-bold mt-2">{systemStats.totalPatients}</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl shadow-lg p-6 text-white">
                                            <div className="text-sm opacity-90">Total Products</div>
                                            <div className="text-4xl font-bold mt-2">{systemStats.totalProducts}</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg p-6 text-white">
                                            <div className="text-sm opacity-90">Total Visits</div>
                                            <div className="text-4xl font-bold mt-2">{systemStats.totalVisits}</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-xl shadow-lg p-6 text-white">
                                            <div className="text-sm opacity-90">Total Prescriptions</div>
                                            <div className="text-4xl font-bold mt-2">{systemStats.totalPrescriptions}</div>
                                        </div>
                                        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg p-6 text-white">
                                            <div className="text-sm opacity-90">Total Purchase Orders</div>
                                            <div className="text-4xl font-bold mt-2">{systemStats.totalPurchaseOrders}</div>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {/* Bulk User Import */}
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Bulk Import Users</h3>
                                        <div className="space-y-4">
                                            <input
                                                type="file"
                                                accept=".csv"
                                                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                                                className="block w-full text-sm text-gray-600 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
                                            />
                                            <button
                                                onClick={handleImportUsers}
                                                disabled={!importFile}
                                                className="bg-gradient-to-r from-blue-600 to-sky-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed w-full"
                                            >
                                                Import Users from CSV
                                            </button>
                                        </div>
                                    </div>

                                    {/* Bulk User Export */}
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Export Users</h3>
                                        <div className="space-y-4">
                                            <select
                                                value={exportFormat}
                                                onChange={(e) => setExportFormat(e.target.value as 'csv' | 'json' | 'xlsx')}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                            >
                                                <option value="csv">CSV</option>
                                                <option value="json">JSON</option>
                                                <option value="xlsx">Excel (XLSX)</option>
                                            </select>
                                            <button
                                                onClick={handleExportUsers}
                                                className="bg-gradient-to-r from-blue-600 to-sky-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all w-full"
                                            >
                                                Export All Users
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Activity Logs Tab */}
                    {activeTab === 'logs' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                        Activity Logs
                                    </h2>
                                    <button
                                        onClick={fetchAuditLogs}
                                        disabled={refreshing}
                                        className="bg-gradient-to-r from-sky-500 to-sky-600 text-white p-2 rounded-lg hover:shadow-lg shadow-sky-500/30 transition-all disabled:opacity-50"
                                        title="Refresh logs"
                                    >
                                        <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                    <input
                                        type="text"
                                        placeholder="Search logs..."
                                        value={logSearch}
                                        onChange={(e) => setLogSearch(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                    />
                                    <select
                                        value={logFilterAction}
                                        onChange={(e) => setLogFilterAction(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                    >
                                        <option value="all">All Actions</option>
                                        <option value="create">Create</option>
                                        <option value="update">Update</option>
                                        <option value="delete">Delete</option>
                                    </select>
                                    <select
                                        value={logFilterEntity}
                                        onChange={(e) => setLogFilterEntity(e.target.value)}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                    >
                                        <option value="all">All Entities</option>
                                        <option value="user">User</option>
                                        <option value="patient">Patient</option>
                                        <option value="product">Product</option>
                                        <option value="prescription">Prescription</option>
                                    </select>
                                </div>

                                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                                    <table className="w-full">
                                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Timestamp</th>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">User</th>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Action</th>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Entity</th>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Details</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {filteredLogs.map(log => (
                                                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                            {new Date(log.timestamp).toLocaleString()}
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200">{log.userName}</td>
                                                        <td className="px-6 py-4 text-sm">
                                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${log.action === 'create' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400' :
                                                                log.action === 'update' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                                                                    log.action === 'delete' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                                                        'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                                }`}>
                                                                {log.action}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 capitalize">{log.entity}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{log.details || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}                    {/* Backup & Export Tab */}
                    {activeTab === 'backup' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                        Backup & Export
                                    </h2>
                                    <button
                                        onClick={fetchBackups}
                                        disabled={refreshing}
                                        className="bg-gradient-to-r from-sky-500 to-sky-600 text-white p-2 rounded-lg hover:shadow-lg shadow-sky-500/30 transition-all disabled:opacity-50"
                                        title="Refresh backups"
                                    >
                                        <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                    {/* Create Backup */}
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Database Backup</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Create a full backup of the database</p>
                                        <button
                                            onClick={handleCreateBackup}
                                            className="bg-gradient-to-r from-blue-600 to-sky-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all w-full"
                                        >
                                            Create New Backup
                                        </button>
                                    </div>

                                    {/* Export Data */}
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6">
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Export Data</h3>
                                        <div className="space-y-4">
                                            <select
                                                value={exportTable}
                                                onChange={(e) => setExportTable(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                            >
                                                <option value="users">Users</option>
                                                <option value="patients">Patients</option>
                                                <option value="products">Products</option>
                                                <option value="visits">Visits</option>
                                                <option value="prescriptions">Prescriptions</option>
                                            </select>
                                            <select
                                                value={exportDataFormat}
                                                onChange={(e) => setExportDataFormat(e.target.value as 'csv' | 'json' | 'xlsx')}
                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                            >
                                                <option value="csv">CSV</option>
                                                <option value="json">JSON</option>
                                                <option value="xlsx">Excel (XLSX)</option>
                                            </select>
                                            <button
                                                onClick={handleExportData}
                                                className="bg-gradient-to-r from-blue-600 to-sky-600 text-white px-6 py-2 rounded-lg hover:shadow-lg transition-all w-full"
                                            >
                                                Export Table Data
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Backup List */}
                                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50">
                                        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Recent Backups</h3>
                                    </div>
                                    <table className="w-full">
                                        <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Filename</th>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Size</th>
                                                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 dark:text-gray-300">Created</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {backups.map(backup => (
                                                <tr key={backup.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-200">{backup.filename}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{backup.size}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                                                        {new Date(backup.createdAt).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Dropdown Options Tab */}
                    {activeTab === 'dropdowns' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8" style={{ height: 'calc(100vh - 250px)' }}>
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative h-full flex flex-col">
                                {/* Header */}
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center gap-3">
                                        {selectedDropdownFile && (
                                            <button
                                                onClick={handleBackToFiles}
                                                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all hover:scale-110"
                                                title="Back to files"
                                            >
                                                <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                </svg>
                                            </button>
                                        )}
                                        {selectedDropdownFile && dropdownItems && dropdownItems.length > 0 && (
                                            <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedDropdownItems.length === dropdownItems.length}
                                                    onChange={toggleSelectAllDropdownItems}
                                                    className="peer sr-only"
                                                />
                                                <div className="w-6 h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                    <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                            </label>
                                        )}
                                        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                            {selectedDropdownFile ? (fileDisplayNames[selectedDropdownFile] || selectedDropdownFile) : 'Dropdown Options'}
                                        </h2>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedDropdownFile && selectedDropdownItems.length > 0 && (
                                            <button
                                                onClick={handleDeleteSelectedDropdownItems}
                                                className="bg-gradient-to-r from-red-600 to-red-700 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all text-sm flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                Delete ({selectedDropdownItems.length})
                                            </button>
                                        )}
                                        {selectedDropdownFile && (
                                            <button
                                                onClick={handleAddDropdownItem}
                                                className="bg-gradient-to-r from-blue-600 to-sky-600 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all text-sm flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                Add Item
                                            </button>
                                        )}
                                        {selectedDropdownFile && (
                                            <button
                                                onClick={handleImportDropdownData}
                                                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all text-sm flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                                Import
                                            </button>
                                        )}
                                        <button
                                            onClick={handlePopulateWithDefaults}
                                            disabled={populatingDefaults}
                                            className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 py-2 rounded-lg hover:shadow-lg shadow-purple-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
                                            title="Populate with defaults from JSON files"
                                        >
                                            {populatingDefaults ? (
                                                <>
                                                    <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    <span className="hidden sm:inline">Populating...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                    </svg>
                                                    <span className="hidden sm:inline">Populate Defaults</span>
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={fetchDropdownFiles}
                                            disabled={refreshing}
                                            className="bg-gradient-to-r from-sky-500 to-sky-600 text-white p-2 rounded-lg hover:shadow-lg shadow-sky-500/30 transition-all disabled:opacity-50"
                                            title="Refresh"
                                        >
                                            <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto scrollbar-hide">
                                    {!selectedDropdownFile ? (
                                        /* File Grid View */
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                            {dropdownFiles.map((file, index) => (
                                                <div
                                                    key={file.name}
                                                    className="relative group animate-fadeIn"
                                                    style={{ animationDelay: `${index * 30}ms` }}
                                                >
                                                    <button
                                                        onClick={() => handleSelectDropdownFile(file.name)}
                                                        className="w-full p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 transition-all duration-200 hover:shadow-lg hover:-translate-y-1"
                                                    >
                                                        <div className="flex flex-col items-center justify-center gap-3">
                                                            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-sky-600 rounded-lg flex items-center justify-center shadow-lg">
                                                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                            </div>
                                                            <div className="text-center">
                                                                <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm truncate">
                                                                    {fileDisplayNames[file.name] || file.name}
                                                                </div>
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                    {file.itemCount} items
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleRenameFile(file.name);
                                                        }}
                                                        className="absolute top-2 right-2 p-1.5 bg-white dark:bg-gray-700 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110 shadow-md"
                                                        title="Rename display name"
                                                    >
                                                        <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : loadingDropdownItems ? (
                                        /* Loading State */
                                        <div className="flex items-center justify-center h-full">
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                                                <p className="text-lg text-gray-600 dark:text-gray-400">Loading options...</p>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Items Grid View */
                                        dropdownItems && dropdownItems.length > 0 ? (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                                {dropdownItems.map((item, index) => (
                                                    <div
                                                        key={index}
                                                        className="relative p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 transition-all duration-200 hover:shadow-lg hover:-translate-y-1 animate-fadeIn group"
                                                        style={{ animationDelay: `${index * 20}ms` }}
                                                    >
                                                        <label className="absolute top-2 left-2 group/checkbox cursor-pointer z-10">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedDropdownItems.includes(index)}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    if (e.target.checked) {
                                                                        setSelectedDropdownItems([...selectedDropdownItems, index]);
                                                                    } else {
                                                                        setSelectedDropdownItems(selectedDropdownItems.filter(i => i !== index));
                                                                    }
                                                                }}
                                                                className="peer sr-only"
                                                            />
                                                            <div className="w-5 h-5 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                                <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            </div>
                                                            <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                        </label>
                                                        <div className="flex flex-col gap-2 pt-6">
                                                            <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                                {item.name || item.label || item.value || 'Unnamed'}
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                                                                {Object.entries(item).map(([key, val]) => (
                                                                    <div key={key} className="truncate">
                                                                        <span className="font-medium">{key}:</span> {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleEditDropdownItem(item)}
                                                                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all hover:scale-110 shadow-md"
                                                                title="Edit"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDropdownItem(item)}
                                                                className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all hover:scale-110 shadow-md"
                                                                title="Delete"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center h-full">
                                                <div className="text-center text-gray-500 dark:text-gray-400 max-w-md">
                                                    <svg className="w-20 h-20 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                                    </svg>
                                                    <p className="text-lg font-medium mb-2">No items found</p>
                                                    <p className="text-sm mb-4">This file is currently empty. You can add items manually or import them from a CSV/Excel file.</p>
                                                    <div className="flex items-center justify-center gap-3">
                                                        <button
                                                            onClick={handleAddDropdownItem}
                                                            className="bg-gradient-to-r from-blue-600 to-sky-600 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all text-sm flex items-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                            Add First Item
                                                        </button>
                                                        <button
                                                            onClick={handleImportDropdownData}
                                                            className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all text-sm flex items-center gap-2"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                            </svg>
                                                            Import Data
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* Floating Action Buttons - Only show when items are selected */}
                                {selectedDropdownFile && !loadingDropdownItems && selectedDropdownItems.length > 0 && (
                                    <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-50 animate-fadeIn mobile-safe-page-fab-stack">
                                        {/* Export Button */}
                                        <div className="relative">
                                            <button
                                                onClick={() => setShowExportMenu(!showExportMenu)}
                                                className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-110 hover:rotate-12 active:scale-95 relative"
                                                title="Export Data"
                                            >
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                                </svg>
                                                {selectedDropdownItems.length > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg animate-pulse">
                                                        {selectedDropdownItems.length}
                                                    </span>
                                                )}
                                            </button>
                                            {showExportMenu && (
                                                <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl min-w-[150px] animate-fadeIn">
                                                    <button
                                                        onClick={() => handleExportDropdownData('json')}
                                                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-colors duration-200 rounded-t-lg"
                                                    >
                                                        <span>JSON</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportDropdownData('csv')}
                                                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-colors duration-200"
                                                    >
                                                        <span>CSV</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportDropdownData('xlsx')}
                                                        className="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 flex items-center gap-2 transition-colors duration-200 rounded-b-lg"
                                                    >
                                                        <span>XLSX</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Delete Selected/All Button */}
                                        <div className="relative">
                                            <button
                                                onClick={() => {
                                                    if (selectedDropdownItems.length > 0) {
                                                        handleDeleteSelectedDropdownItems();
                                                    } else {
                                                        setShowDeleteAllMenu(!showDeleteAllMenu);
                                                    }
                                                }}
                                                className="bg-gradient-to-r from-red-600 to-red-700 text-white p-4 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-110 hover:rotate-12 active:scale-95 relative"
                                                title={selectedDropdownItems.length > 0 ? "Delete Selected Items" : "Delete All Items"}
                                            >
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                {selectedDropdownItems.length > 0 && (
                                                    <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg animate-pulse">
                                                        {selectedDropdownItems.length}
                                                    </span>
                                                )}
                                            </button>
                                            {showDeleteAllMenu && selectedDropdownItems.length === 0 && (
                                                <div className="absolute bottom-full right-0 mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl min-w-[200px] p-4 animate-fadeIn">
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                                                        Delete all {dropdownItems?.length || 0} items?
                                                    </p>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={handleDeleteAllDropdownItems}
                                                            className="flex-1 bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 text-sm transition-all duration-200 hover:scale-105 active:scale-95"
                                                        >
                                                            Delete All
                                                        </button>
                                                        <button
                                                            onClick={() => setShowDeleteAllMenu(false)}
                                                            className="flex-1 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 px-3 py-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-500 text-sm transition-all duration-200 hover:scale-105 active:scale-95"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Product Mapping Tab */}
                    {activeTab === 'mappings' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                            Product Mapping
                                        </h2>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Manage bill product name mappings and tags</p>
                                    </div>
                                    <button
                                        onClick={fetchProductMappings}
                                        disabled={refreshing}
                                        className="bg-gradient-to-r from-sky-500 to-sky-600 text-white p-2 rounded-lg hover:shadow-lg shadow-sky-500/30 transition-all disabled:opacity-50"
                                        title="Refresh mappings"
                                    >
                                        <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="mb-6">
                                    <input
                                        type="text"
                                        placeholder="Search by bill product name or mapped product..."
                                        value={mappingSearch}
                                        onChange={(e) => setMappingSearch(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                {/* Selection Actions */}
                                {selectedMappingIds.size > 0 && (
                                    <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/30 dark:to-sky-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                                                {selectedMappingIds.size} item{selectedMappingIds.size > 1 ? 's' : ''} selected
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setSelectedMappingIds(new Set())}
                                            className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-gray-800 border border-blue-500 dark:border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all flex items-center justify-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Clear All
                                        </button>
                                    </div>
                                )}

                                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/30 dark:to-sky-900/30 border-b border-gray-200 dark:border-gray-700">
                                                <tr>
                                                    <th className="px-6 py-3 text-left">
                                                        <label className="relative group/checkbox cursor-pointer inline-flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                checked={productMappings.length > 0 && selectedMappingIds.size === productMappings.filter(mapping => 
                                                                    !mappingSearch || 
                                                                    mapping.billProductName.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                                                                    mapping.product?.name.toLowerCase().includes(mappingSearch.toLowerCase())
                                                                ).length}
                                                                onChange={(e) => {
                                                                    const filteredMappings = productMappings.filter(mapping => 
                                                                        !mappingSearch || 
                                                                        mapping.billProductName.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                                                                        mapping.product?.name.toLowerCase().includes(mappingSearch.toLowerCase())
                                                                    );
                                                                    if (e.target.checked) {
                                                                        setSelectedMappingIds(new Set(filteredMappings.map(m => m.id)));
                                                                    } else {
                                                                        setSelectedMappingIds(new Set());
                                                                    }
                                                                }}
                                                                className="peer sr-only"
                                                            />
                                                            <div className="w-6 h-6 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                                <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            </div>
                                                            <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                        </label>
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Bill Product Name</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Mapped Product</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tags</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Stock</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {productMappings
                                                    .filter(mapping => 
                                                        !mappingSearch || 
                                                        mapping.billProductName.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                                                        mapping.product?.name.toLowerCase().includes(mappingSearch.toLowerCase())
                                                    )
                                                    .map((mapping) => (
                                                        <tr key={mapping.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                                            selectedMappingIds.has(mapping.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                                                        }`}>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <label className="relative group/checkbox cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedMappingIds.has(mapping.id)}
                                                                        onChange={(e) => {
                                                                            const newSet = new Set(selectedMappingIds);
                                                                            if (e.target.checked) {
                                                                                newSet.add(mapping.id);
                                                                            } else {
                                                                                newSet.delete(mapping.id);
                                                                            }
                                                                            setSelectedMappingIds(newSet);
                                                                        }}
                                                                        className="peer sr-only"
                                                                    />
                                                                    <div className="w-5 h-5 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                                        <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    </div>
                                                                    <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                                </label>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{mapping.billProductName}</div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="text-sm text-gray-900 dark:text-gray-100">{mapping.product?.name || 'N/A'}</div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="flex flex-wrap gap-1">
                                                                    {mapping.product?.tags && mapping.product.tags.length > 0 ? (
                                                                        mapping.product.tags.map((tag: string, idx: number) => (
                                                                            <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                                                                                {tag}
                                                                            </span>
                                                                        ))
                                                                    ) : (
                                                                        <span className="text-xs text-gray-400">No tags</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <div className="text-sm text-gray-600 dark:text-gray-400">{mapping.product?.quantity || 0}</div>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedMapping(mapping);
                                                                        setMappingDeleteStep(1);
                                                                        setShowDeleteMappingModal(true);
                                                                    }}
                                                                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors"
                                                                >
                                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                        {productMappings.filter(mapping => 
                                            !mappingSearch || 
                                            mapping.billProductName.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                                            mapping.product?.name.toLowerCase().includes(mappingSearch.toLowerCase())
                                        ).length === 0 && (
                                            <div className="text-center py-12">
                                                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                                </svg>
                                                <p className="mt-4 text-gray-500 dark:text-gray-400">No product mappings found</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">💡 How Product Mapping Works</h3>
                                    <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                                        <li>• When you map a bill product name to an existing product, it's automatically added as a <strong>tag</strong> to that product</li>
                                        <li>• Tags enable the system to recognize multiple names for the same product in future bills</li>
                                        <li>• Products with tags will be automatically matched when processing new bills</li>
                                        <li>• You can map multiple bill names to a single product by creating mappings from different bills</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Default Values Tab */}
                    {activeTab === 'defaults' && (
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-3 sm:p-4 md:p-6 lg:p-8 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                <div className="mb-6 flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-sky-600 bg-clip-text text-transparent">
                                                    {selectedDefaultPage ? (defaultValuePages.find(p => p.page === selectedDefaultPage)?.label || 'Default Values') : 'Default Values'}
                                                </h2>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                                    {selectedDefaultPage ? 'Edit default values for this page' : 'Select a page to configure its default values'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={fetchDefaultValuePages}
                                        disabled={loading}
                                        className="p-2.5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                                        title="Reload default values"
                                    >
                                        <svg className={`w-5 h-5 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>

                                {!selectedDefaultPage ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {defaultValuePages.map((page, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => selectDefaultValuePage(page)}
                                                className="relative group p-6 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 bg-white dark:bg-gray-800 transition-all hover:shadow-lg hover:shadow-blue-500/20 hover:scale-105"
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                    </div>
                                                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                        {Object.keys(page.values || {}).length} fields
                                                    </div>
                                                </div>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">{page.label}</h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">{page.page}</p>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div>
                                        <div className="mb-6">
                                            <button
                                                onClick={() => {
                                                    setSelectedDefaultPage(null);
                                                    setEditingDefaultValues({});
                                                }}
                                                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                                </svg>
                                                Back to Pages
                                            </button>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
                                            <div className="space-y-4 mb-6">
                                                {Object.entries(defaultValues).map(([key, value]) => {
                                                    const isNumberField = typeof value === 'number';
                                                    return (
                                                        <div key={key}>
                                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 capitalize">
                                                                {key.replace(/([A-Z])/g, ' $1').trim()}
                                                            </label>
                                                            <input
                                                                type={isNumberField ? 'number' : 'text'}
                                                                value={editingDefaultValues[key] ?? value}
                                                                onChange={(e) => {
                                                                    const val = isNumberField ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                                                                    setEditingDefaultValues({ ...editingDefaultValues, [key]: val });
                                                                }}
                                                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            <div className="flex gap-3">
                                                <button
                                                    onClick={handleSaveDefaultValues}
                                                    disabled={loading}
                                                    className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {loading ? 'Saving...' : 'Save Changes'}
                                                </button>
                                                <button
                                                    onClick={() => setEditingDefaultValues(defaultValues)}
                                                    disabled={loading}
                                                    className="px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Reset
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">ℹ️ About Default Values</h3>
                                            <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1">
                                                <li>• Default values are automatically applied when creating new items</li>
                                                <li>• Changes here affect all future items, not existing ones</li>
                                                <li>• Users can still override these values when creating items</li>
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* User Action Modal */}
            {selectedUser && userAction && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-md">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            {loading ? (
                                /* Loading State */
                                <div className="flex flex-col items-center justify-center py-8">
                                    <div className="relative mb-4">
                                        <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-800 rounded-full"></div>
                                        <div className="w-16 h-16 border-4 border-blue-600 dark:border-blue-400 rounded-full animate-spin border-t-transparent absolute top-0 left-0"></div>
                                    </div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Processing...</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                                        {userAction === 'changeRole' ? 'Changing user role' :
                                            userAction === 'resetPassword' ? 'Resetting password' :
                                                userAction === 'expireSession' ? 'Expiring session' :
                                                    'Deleting user'}
                                    </p>
                                </div>
                            ) : (
                                /* Confirmation State */
                                <>
                                    <h3 className="text-xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent mb-4">
                                        {userAction === 'changeRole' ? 'Change User Role' :
                                            userAction === 'resetPassword' ? 'Reset Password' :
                                                userAction === 'expireSession' ? 'Expire Session' :
                                                    'Delete User'}
                                    </h3>

                                    <div className="mb-4">
                                        <p className="text-sm text-gray-600 dark:text-gray-400">User: <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedUser.name}</span></p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">Email: <span className="font-semibold text-gray-900 dark:text-gray-100">{selectedUser.email}</span></p>
                                    </div>

                        {userAction === 'changeRole' && (
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">New Role</label>
                                <div className={isRoleDropdownOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                    <CustomSelect
                                        value={newRole}
                                        onChange={(val) => setNewRole(val)}
                                        options={[
                                            { value: '', label: 'Select role' },
                                            { value: 'admin', label: 'Admin' },
                                            { value: 'doctor', label: 'Doctor' },
                                            { value: 'staff', label: 'Staff' },
                                            { value: 'receptionist', label: 'Receptionist' }
                                        ]}
                                        placeholder="Select role"
                                        onOpenChange={setIsRoleDropdownOpen}
                                    />
                                </div>
                            </div>
                        )}

                        {userAction === 'delete' && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-sm text-red-700">⚠️ This action cannot be undone. All user data will be permanently deleted.</p>
                            </div>
                        )}

                                    <div className="flex space-x-3">
                                        <button
                                            onClick={handleUserAction}
                                            disabled={loading}
                                            className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${userAction === 'delete'
                                                ? 'bg-gradient-to-r from-red-600 to-red-700 hover:shadow-lg'
                                                : 'bg-gradient-to-r from-blue-600 to-sky-600 hover:shadow-lg'
                                                }`}
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedUser(null);
                                                setUserAction(null);
                                                setNewRole('');
                                            }}
                                            disabled={loading}
                                            className="flex-1 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Enhanced Reset Data Modal with Progress */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-md">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            {/* Confirmation State */}
                            {resetModalState === 'confirm' && (
                                <>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Confirm Data Reset</h3>
                                    </div>

                                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                        <p className="text-sm text-red-700 dark:text-red-400 mb-2 font-semibold">⚠️ WARNING: You are about to reset data from:</p>
                                        <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-400 max-h-32 overflow-y-auto">
                                            {selectedTables.map(table => (
                                                <li key={table} className="capitalize">{table} ({dataCounts[table] || 0} records)</li>
                                            ))}
                                        </ul>
                                        <p className="text-sm text-red-700 dark:text-red-400 mt-3 font-bold">🚨 This action cannot be undone!</p>
                                    </div>

                                    <div className="mb-4">
                                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                            Type <span className="font-mono bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded text-red-600 dark:text-red-400">RESET</span> to confirm:
                                        </label>
                                        <input
                                            type="text"
                                            value={confirmationText}
                                            onChange={(e) => setConfirmationText(e.target.value)}
                                            placeholder="Type RESET here"
                                            className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white dark:bg-gray-800 dark:text-gray-200 font-mono"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="flex space-x-3">
                                        <button
                                            onClick={handleDeleteData}
                                            disabled={confirmationText !== 'RESET'}
                                            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            Reset Data
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowDeleteConfirm(false);
                                                setConfirmationText('');
                                            }}
                                            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* Progress State */}
                            {resetModalState === 'progress' && (
                                <>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Resetting Data...</h3>
                                    </div>

                                    <div className="mb-6">
                                        <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
                                            <span>Progress</span>
                                            <span>{resetProgress.current} / {resetProgress.total}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                                            <div 
                                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-full transition-all duration-300 ease-out"
                                                style={{ width: `${resetProgress.total > 0 ? (resetProgress.current / resetProgress.total) * 100 : 0}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                                            Currently processing: <span className="font-semibold text-gray-900 dark:text-gray-100">{resetProgress.currentTable}</span>
                                        </p>
                                    </div>

                                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-4">
                                        <p className="text-sm text-yellow-800 dark:text-yellow-400">
                                            ⏳ Please wait while we reset your data. This may take a few moments.
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleCancelReset}
                                        disabled={!abortResetController}
                                        className="w-full px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Cancel Operation
                                    </button>
                                </>
                            )}

                            {/* Success State */}
                            {resetModalState === 'success' && (
                                <>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className="p-3 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                                            <svg className="w-6 h-6 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Reset Complete!</h3>
                                    </div>

                                    <div className="mb-6">
                                        <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4">
                                            <p className="text-sm text-sky-800 dark:text-sky-400 mb-2">
                                                ✅ Successfully reset {selectedTables.length} table{selectedTables.length !== 1 ? 's' : ''}
                                            </p>
                                            <p className="text-xs text-sky-700 dark:text-sky-500">
                                                All selected data has been removed from the system.
                                            </p>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleCloseSuccessModal}
                                        className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-sky-600 to-sky-700 text-white font-medium hover:shadow-lg hover:shadow-sky-500/30 transition-all"
                                    >
                                        Done
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation/Progress Modal */}
            {showDeleteConfirmModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
                    <div className="relative rounded-xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-md animate-scaleIn">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            {deleteProgress.total === 0 ? (
                                // Confirmation Step
                                <>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                            <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                            {deleteConfirmStep === 1 ? 'Confirm Deletion' : 'Final Confirmation'}
                                        </h3>
                                    </div>

                                    <div className="mb-6">
                                        <p className="text-gray-700 dark:text-gray-300 mb-2">
                                            {deleteConfirmStep === 1 ? (
                                                <>
                                                    {deleteMode === 'single' && 'Are you sure you want to delete this item?'}
                                                    {deleteMode === 'selected' && `Are you sure you want to delete ${selectedDropdownItems.length} selected items?`}
                                                    {deleteMode === 'all' && `Are you sure you want to delete all ${dropdownItems.length} items?`}
                                                </>
                                            ) : 'This action is irreversible and permanently removes these dropdown values. Do you want to continue?'}
                                        </p>
                                        <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                                            This action cannot be undone.
                                        </p>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                setShowDeleteConfirmModal(false);
                                                setDeleteMode(null);
                                                setDeleteConfirmStep(1);
                                            }}
                                            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (deleteConfirmStep === 1) {
                                                    setDeleteConfirmStep(2);
                                                    return;
                                                }
                                                executeDelete();
                                            }}
                                            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all"
                                        >
                                            {deleteConfirmStep === 1 ? 'Review Impact' : 'Delete'}
                                        </button>
                                    </div>
                                </>
                            ) : deletingSummary.success + deletingSummary.errors === deleteProgress.total ? (
                                // Complete Step
                                <>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                                            <svg className="w-6 h-6 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                            Deletion Complete
                                        </h3>
                                    </div>

                                    <div className="mb-6 space-y-2">
                                        <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Successfully deleted:</span>
                                            <span className="text-lg font-bold text-sky-600 dark:text-sky-400">{deletingSummary.success}</span>
                                        </div>
                                        {deletingSummary.errors > 0 && (
                                            <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Failed to delete:</span>
                                                <span className="text-lg font-bold text-red-600 dark:text-red-400">{deletingSummary.errors}</span>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setShowDeleteConfirmModal(false);
                                            setDeleteMode(null);
                                            setDeleteConfirmStep(1);
                                            setDeleteProgress({ current: 0, total: 0 });
                                            setDeletingSummary({ success: 0, errors: 0 });
                                        }}
                                        className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-sky-600 to-sky-700 text-white font-medium hover:shadow-lg hover:shadow-sky-500/30 transition-all"
                                    >
                                        Done
                                    </button>
                                </>
                            ) : (
                                // Progress Step
                                <>
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                            <div className="w-6 h-6 border-3 border-blue-600 dark:border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                                            Deleting Items...
                                        </h3>
                                    </div>

                                    <div className="mb-6">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                Progress
                                            </span>
                                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                                                {deleteProgress.current} / {deleteProgress.total}
                                            </span>
                                        </div>
                                        <div className="w-full h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-gradient-to-r from-blue-600 to-blue-700 transition-all duration-300 ease-out"
                                                style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                                            ></div>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Please wait while items are being deleted...
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Rename File Modal */}
            {showRenameModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-md animate-scaleIn">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                    Rename Display Name
                                </h3>
                                <button
                                    onClick={() => {
                                        setShowRenameModal(false);
                                        setRenamingFile(null);
                                        setNewFileName('');
                                    }}
                                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                    <p className="text-sm text-blue-800 dark:text-blue-300">
                                        This only changes the display name. The actual file name remains: <span className="font-mono font-semibold">{renamingFile}</span>
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Display Name
                                    </label>
                                    <input
                                        type="text"
                                        value={newFileName}
                                        onChange={(e) => setNewFileName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                handleSaveRename();
                                            }
                                        }}
                                        placeholder="Enter display name"
                                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => {
                                            setShowRenameModal(false);
                                            setRenamingFile(null);
                                            setNewFileName('');
                                        }}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSaveRename}
                                        disabled={!newFileName.trim()}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Dropdown Import Modal */}
            {showDropdownImportModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4 animate-fadeIn backdrop-blur-sm">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-scaleIn">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg animate-pulse">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                            Import Data
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {selectedDropdownFile}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowDropdownImportModal(false);
                                        resetImportModal();
                                    }}
                                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-all hover:scale-110 hover:rotate-90 duration-200"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Step Indicator */}
                            <div className="flex items-center justify-center mb-8 overflow-x-auto pb-2">
                                <div className="flex items-center space-x-2 sm:space-x-4">
                                    {['select', 'preview', 'checking', 'confirm', 'importing', 'success'].map((s, i) => {
                                        const stepIndex = ['select', 'preview', 'checking', 'confirm', 'importing', 'success'].indexOf(importStep);
                                        const isActive = stepIndex >= i;
                                        const isCurrent = stepIndex === i;
                                        return (
                                            <div key={s} className="flex items-center">
                                                <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-semibold transition-all duration-300 ${
                                                    isActive
                                                        ? 'bg-gradient-to-r from-blue-600 to-sky-600 text-white shadow-lg shadow-blue-500/50'
                                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500'
                                                } ${isCurrent ? 'scale-110 animate-pulse' : ''}`}>
                                                    {isActive ? (
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : (
                                                        <span className="text-sm">{i + 1}</span>
                                                    )}
                                                </div>
                                                {i < 5 && (
                                                    <div className={`w-8 sm:w-12 h-1 mx-1 sm:mx-2 transition-all duration-300 ${
                                                        stepIndex > i
                                                            ? 'bg-gradient-to-r from-blue-600 to-sky-600'
                                                            : 'bg-gray-200 dark:bg-gray-700'
                                                    }`} />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Step: Select File */}
                            {importStep === 'select' && (
                                <div className="space-y-6 animate-fadeIn">
                                    {/* Info Card */}
                                    <div className="p-4 sm:p-6 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border border-blue-200 dark:border-blue-800 rounded-xl shadow-md animate-slideDown">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div className="flex-1">
                                                <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-3 text-lg">File Requirements</h4>
                                                <div className="text-sm text-blue-800 dark:text-blue-300 space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-sky-600" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                        <span>Supported formats: <strong>CSV, XLSX, JSON</strong></span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <svg className="w-4 h-4 text-sky-600" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                        <span>File structure should match: <strong className="font-mono">{selectedDropdownFile}</strong></span>
                                                    </div>
                                                    {dropdownItems && dropdownItems.length > 0 && (
                                                        <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                                                            <p className="font-medium mb-2 flex items-center gap-2">
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                                Expected fields:
                                                            </p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {Object.keys(dropdownItems[0]).map((key, idx) => (
                                                                    <span key={idx} className="px-2 py-1 text-xs font-mono bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 rounded border border-blue-300 dark:border-blue-700">
                                                                        {key}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* File Upload Area */}
                                    <div className="animate-slideUp">
                                        <label 
                                            className="block relative group cursor-pointer"
                                            onDragOver={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20', 'scale-[1.02]');
                                            }}
                                            onDragLeave={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20', 'scale-[1.02]');
                                            }}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20', 'scale-[1.02]');
                                                const file = e.dataTransfer.files?.[0];
                                                if (file) {
                                                    handleFileImport(file);
                                                }
                                            }}
                                        >
                                            <div className="border-3 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center transition-all duration-300 hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 hover:shadow-lg hover:scale-[1.01] group-hover:shadow-blue-500/20">
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-sky-100 dark:from-blue-900/30 dark:to-sky-900/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                                        <svg className="w-10 h-10 text-blue-600 dark:text-blue-400 group-hover:animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                            Drop your file here or click to browse
                                                        </p>
                                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                                            CSV, XLSX, or JSON files accepted
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-lg shadow-lg group-hover:shadow-xl group-hover:shadow-blue-500/50 transition-all duration-300 group-hover:scale-105">
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                        <span className="font-medium">Select File</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <input
                                                type="file"
                                                accept=".csv,.xlsx,.xls,.json"
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (file) {
                                                        handleFileImport(file);
                                                    }
                                                }}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>

                                    {/* Quick Tips */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-slideUp" style={{ animationDelay: '100ms' }}>
                                        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-all hover:scale-105 duration-200">
                                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span className="font-semibold text-sm">Smart Import</span>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Automatically detects duplicates and validates data structure
                                            </p>
                                        </div>
                                        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-all hover:scale-105 duration-200">
                                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-2">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                                <span className="font-semibold text-sm">Flexible Options</span>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Choose to skip, update, or replace duplicate entries
                                            </p>
                                        </div>
                                        <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-all hover:scale-105 duration-200">
                                            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-2">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                                <span className="font-semibold text-sm">Fast Processing</span>
                                            </div>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Batch import with real-time progress tracking
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step: Preview */}
                            {importStep === 'preview' && (
                                <div className="space-y-4">
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                        <p className="text-blue-800 dark:text-blue-300">
                                            ✓ Found {importParsedData.length} items in file
                                        </p>
                                    </div>

                                    <div className="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                                        <div className="p-4 space-y-2">
                                            {importParsedData.slice(0, 10).map((item, index) => (
                                                <div key={index} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                                    <div className="text-sm text-gray-700 dark:text-gray-300">
                                                        {Object.entries(item).map(([key, val]) => (
                                                            <span key={key} className="mr-3">
                                                                <strong>{key}:</strong> {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                            {importParsedData.length > 10 && (
                                                <p className="text-center text-sm text-gray-500 dark:text-gray-400 pt-2">
                                                    ...and {importParsedData.length - 10} more items
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => {
                                                resetImportModal();
                                            }}
                                            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={checkDropdownDuplicates}
                                            disabled={loading}
                                            className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50"
                                        >
                                            {loading ? 'Checking...' : 'Continue'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Step: Checking */}
                            {importStep === 'checking' && (
                                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                                    <p className="text-lg text-gray-600 dark:text-gray-400">Checking for duplicates...</p>
                                </div>
                            )}

                            {/* Step: Confirm */}
                            {importStep === 'confirm' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
                                            <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{importUniqueCount}</p>
                                            <p className="text-sm text-blue-800 dark:text-blue-300">New Items</p>
                                        </div>
                                        <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg text-center">
                                            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{importDuplicateCount}</p>
                                            <p className="text-sm text-orange-800 dark:text-orange-300">Duplicates</p>
                                        </div>
                                    </div>

                                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                                        <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                                            Choose how to handle duplicate items:
                                        </p>
                                    </div>

                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => handleConfirmImport('skip')}
                                            disabled={loading}
                                            className="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 text-left"
                                        >
                                            <div className="font-semibold">Import {importUniqueCount} New Items Only</div>
                                            <div className="text-sm opacity-90">Skip duplicates</div>
                                        </button>
                                        <button
                                            onClick={() => handleConfirmImport('update')}
                                            disabled={loading}
                                            className="px-4 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 text-left"
                                        >
                                            <div className="font-semibold">Update {importDuplicateCount} Duplicates + Import {importUniqueCount} New</div>
                                            <div className="text-sm opacity-90">Replace existing items with new data</div>
                                        </button>
                                        <button
                                            onClick={() => {
                                                resetImportModal();
                                            }}
                                            className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Step: Importing */}
                            {importStep === 'importing' && (
                                <div className="space-y-6">
                                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                        <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600"></div>
                                        <p className="text-lg text-gray-600 dark:text-gray-400">
                                            Importing... {importProgress.current} / {importProgress.total}
                                        </p>
                                        <div className="w-full max-w-md bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
                                            <div
                                                className="bg-gradient-to-r from-blue-600 to-sky-600 h-full transition-all duration-300"
                                                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step: Success */}
                            {importStep === 'success' && (
                                <div className="space-y-6">
                                    <div className="flex flex-col items-center justify-center py-8 space-y-4">
                                        <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                                            <svg className="w-10 h-10 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <h4 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Import Complete!</h4>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        {importSummary.success > 0 && (
                                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
                                                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{importSummary.success}</p>
                                                <p className="text-sm text-blue-800 dark:text-blue-300">Added</p>
                                            </div>
                                        )}
                                        {importSummary.updated > 0 && (
                                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
                                                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{importSummary.updated}</p>
                                                <p className="text-sm text-blue-800 dark:text-blue-300">Updated</p>
                                            </div>
                                        )}
                                        {importSummary.errors > 0 && (
                                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-center">
                                                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{importSummary.errors}</p>
                                                <p className="text-sm text-red-800 dark:text-red-300">Failed</p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => {
                                            setShowDropdownImportModal(false);
                                            resetImportModal();
                                        }}
                                        className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white font-medium hover:shadow-lg transition-all"
                                    >
                                        Done
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Dropdown Item Modal */}
            {showDropdownItemModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            <h3 className="text-xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent mb-4">
                                {dropdownModalMode === 'add' ? 'Add New Item' : 'Edit Item'}
                            </h3>

                            <div className="space-y-4 mb-4">
                                {(() => {
                                    // For bottlePricing file, ensure we have value, label, and price fields
                                    const isBottlePricing = selectedDropdownFile?.toLowerCase().includes('bottlepricing') || selectedDropdownFile?.toLowerCase().includes('bottle-pricing') || selectedDropdownFile?.toLowerCase().includes('bottle_pricing');
                                    const baseFields = editingDropdownItem || (dropdownItems && dropdownItems.length > 0 ? dropdownItems[0] : null) || (isBottlePricing ? { value: '', label: '', price: 0 } : { name: '', value: '' });
                                    
                                    return Object.keys(baseFields).map(key => {
                                        // Determine field type based on the value
                                        const sampleValue = editingDropdownItem?.[key] ?? (dropdownItems && dropdownItems.length > 0 ? dropdownItems[0][key] : baseFields[key]);
                                        const isNumberField = typeof sampleValue === 'number' || key.toLowerCase().includes('price');
                                        
                                        return (
                                            <div key={key}>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 capitalize">{key}</label>
                                                <input
                                                    type={isNumberField ? 'number' : 'text'}
                                                    value={newDropdownItem[key] ?? ''}
                                                    onChange={(e) => {
                                                        const value = isNumberField ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
                                                        setNewDropdownItem({ ...newDropdownItem, [key]: value });
                                                    }}
                                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 dark:text-gray-200"
                                                    step={isNumberField ? "0.01" : undefined}
                                                />
                                            </div>
                                        );
                                    });
                                })()}
                        </div>

                        <div className="flex space-x-3">
                            <button
                                onClick={handleSaveDropdownItem}
                                disabled={loading}
                                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowDropdownItemModal(false);
                                    setNewDropdownItem({});
                                    setEditingDropdownItem(null);
                                }}
                                disabled={loading}
                                className="flex-1 px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                        </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Dropdown Item Delete Confirmation Modal */}
            {showDropdownDeleteModal && itemToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-md">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{dropdownDeleteStep === 1 ? 'Delete Item' : 'Final Confirmation'}</h3>
                            </div>

                            <div className="mb-6">
                                <p className="text-gray-700 dark:text-gray-300 mb-3">{dropdownDeleteStep === 1 ? 'Are you sure you want to delete this item?' : 'This action is irreversible and cannot be undone. Do you want to continue?'}</p>
                                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <p className="font-medium text-gray-900 dark:text-gray-100">{itemToDelete.name || itemToDelete.label || itemToDelete.value}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Value: {itemToDelete.value}</p>
                                </div>
                                <p className="text-sm text-red-600 dark:text-red-400 mt-3 font-medium">⚠️ This action cannot be undone!</p>
                            </div>

                            <div className="flex space-x-3">
                                <button
                                    onClick={() => {
                                        if (dropdownDeleteStep === 1) {
                                            setDropdownDeleteStep(2);
                                            return;
                                        }
                                        confirmDeleteDropdownItem();
                                    }}
                                    disabled={loading}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Deleting...' : (dropdownDeleteStep === 1 ? 'Review Impact' : 'Delete')}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowDropdownDeleteModal(false);
                                        setItemToDelete(null);
                                        setDropdownDeleteStep(1);
                                    }}
                                    disabled={loading}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Mapping Delete Confirmation Modal */}
            {showDeleteMappingModal && selectedMapping && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
                    <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-md">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{mappingDeleteStep === 1 ? 'Delete Mapping' : 'Final Confirmation'}</h3>
                            </div>

                            <div className="mb-6">
                                <p className="text-gray-700 dark:text-gray-300 mb-3">{mappingDeleteStep === 1 ? 'Are you sure you want to delete this product mapping?' : 'This action is irreversible and removes the mapping permanently. Do you want to continue?'}</p>
                                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <p className="font-medium text-gray-900 dark:text-gray-100">{selectedMapping.billProductName}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">→ {selectedMapping.product?.name}</p>
                                </div>
                                <p className="text-sm text-red-600 dark:text-red-400 mt-3 font-medium">⚠️ This will not remove the tag from the product!</p>
                            </div>

                            <div className="flex space-x-3">
                                <button
                                    onClick={async () => {
                                        if (mappingDeleteStep === 1) {
                                            setMappingDeleteStep(2);
                                            return;
                                        }
                                        setLoading(true);
                                        try {
                                            const res = await fetch('/api/product-mappings', {
                                                method: 'DELETE',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ billProductName: selectedMapping.billProductName })
                                            });
                                            if (res.ok) {
                                                showSuccess('Mapping deleted successfully');
                                                fetchProductMappings();
                                            } else {
                                                showError('Failed to delete mapping');
                                            }
                                        } catch (error) {
                                            showError('Failed to delete mapping');
                                        } finally {
                                            setLoading(false);
                                            setShowDeleteMappingModal(false);
                                            setSelectedMapping(null);
                                            setMappingDeleteStep(1);
                                        }
                                    }}
                                    disabled={loading}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-gradient-to-r from-red-600 to-red-700 text-white font-medium hover:shadow-lg hover:shadow-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Deleting...' : (mappingDeleteStep === 1 ? 'Review Impact' : 'Delete')}
                                </button>
                                <button
                                    onClick={() => {
                                        setShowDeleteMappingModal(false);
                                        setSelectedMapping(null);
                                        setMappingDeleteStep(1);
                                    }}
                                    disabled={loading}
                                    className="flex-1 px-4 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Populate Defaults Results Modal */}
            {showPopulateModal && populateResults && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
                    <div className="relative rounded-xl border border-green-200/30 dark:border-green-700/30 bg-gradient-to-br from-white via-green-50/30 to-emerald-50/20 dark:from-gray-900 dark:via-green-950/20 dark:to-gray-900 shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-br from-green-400/5 via-transparent to-emerald-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative flex flex-col h-full">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                        <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Populate Defaults Complete</h3>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowPopulateModal(false);
                                        setPopulateResults(null);
                                    }}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mb-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{populateResults.totalImported}</div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">Items Imported</div>
                                    </div>
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{populateResults.filesProcessed}</div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">Files Processed</div>
                                    </div>
                                    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                        <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{populateResults.totalSkipped}</div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">Skipped</div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Details by Category:</h4>
                                <div className="space-y-2">
                                    {populateResults.results.map((result: any, index: number) => (
                                        <div key={index} className={`p-3 rounded-lg border ${
                                            result.status === 'success' 
                                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                                                : result.status === 'error'
                                                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                                                : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700'
                                        }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    {result.status === 'success' && (
                                                        <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                    {result.status === 'error' && (
                                                        <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    )}
                                                    {result.status === 'skipped' && (
                                                        <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                    )}
                                                    <span className="font-medium text-gray-900 dark:text-gray-100">{result.category}</span>
                                                </div>
                                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                                    {result.status === 'success' && `+${result.imported} items`}
                                                    {result.status === 'skipped' && result.message}
                                                    {result.status === 'error' && result.message}
                                                </div>
                                            </div>
                                            {result.status === 'success' && (
                                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    Existing: {result.existing} | Imported: {result.imported} | Skipped: {result.skipped}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <button
                                    onClick={() => {
                                        setShowPopulateModal(false);
                                        setPopulateResults(null);
                                    }}
                                    className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-green-600 to-emerald-700 text-white font-medium hover:shadow-lg hover:shadow-green-500/30 transition-all"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notifications */}
            <ToastNotification toasts={toasts} removeToast={removeToast} />
        </div>
    );
}

