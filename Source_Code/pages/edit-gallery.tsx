import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import EditLayout from '../components/EditLayout';
import ConfirmModal from '../components/ConfirmModal';
import StatusModal from '../components/StatusModal';
import Image from 'next/image';

interface GalleryImage {
  imageUrl: string;
  order: number;
}

export default function EditGalleryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<number>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  
  // Status modal states
  const [statusModal, setStatusModal] = useState({
    isOpen: false,
    status: 'loading' as 'loading' | 'success' | 'error',
    message: ''
  });

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'admin') {
      router.push('/');
      return;
    }
    loadGallery();
  }, [user]);

  async function loadGallery() {
    try {
      const res = await fetch('/api/gallery-content');
      const data = await res.json();
      setImages(data);
      setLoading(false);
    } catch (error) {
      setStatusModal({ 
        isOpen: true, 
        status: 'error', 
        message: 'Failed to load gallery. Please refresh the page.' 
      })
      setLoading(false);
    }
  }

  async function handleImageUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true; // Allow multiple file selection
    input.onchange = async (e: any) => {
      const files = Array.from(e.target.files || []) as File[];
      if (files.length === 0) return;

      try {
        let uploadedCount = 0;
        const newImages: GalleryImage[] = [];
        
        for (const file of files) {
          const reader = new FileReader();
          await new Promise((resolve, reject) => {
            reader.onloadend = async () => {
              try {
                const base64 = reader.result as string;
                const uploadRes = await fetch('/api/upload-image', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ 
                    image: base64,
                    folder: 'gallery'
                  })
                });
                const uploadData = await uploadRes.json();
                
                if (uploadData.url) {
                  newImages.push({ imageUrl: uploadData.url, order: images.length + newImages.length });
                  uploadedCount++;
                  resolve(uploadData.url);
                } else {
                  reject(new Error(uploadData.error || 'Upload failed'));
                }
              } catch (error) {
                reject(error);
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        }
        
        setImages([...images, ...newImages]);
        setStatusModal({ 
          isOpen: true, 
          status: 'success', 
          message: `${uploadedCount} image(s) uploaded successfully!` 
        })
      } catch (error: any) {
        setStatusModal({ 
          isOpen: true, 
          status: 'error', 
          message: error.message || 'Failed to upload some images. Please try again.' 
        })
      }
    };
    input.click();
  }

  function deleteImage(index: number) {
    setDeleteIndex(index);
    setShowDeleteConfirm(true);
  }

  function confirmDelete() {
    if (deleteIndex !== null) {
      const newImages = images.filter((_, i) => i !== deleteIndex);
      // Reorder after deletion
      const reordered = newImages.map((img, i) => ({ ...img, order: i }));
      setImages(reordered);
      // Remove from selected if it was selected
      const newSelected = new Set(selectedImages);
      newSelected.delete(deleteIndex);
      // Adjust indices for items after deleted one
      const adjustedSelected = new Set<number>();
      newSelected.forEach(idx => {
        if (idx > deleteIndex) {
          adjustedSelected.add(idx - 1);
        } else if (idx < deleteIndex) {
          adjustedSelected.add(idx);
        }
      });
      setSelectedImages(adjustedSelected);
    }
    setShowDeleteConfirm(false);
    setDeleteIndex(null);
  }

  function toggleImageSelection(index: number) {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedImages(newSelected);
  }

  function selectAllImages() {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(images.map((_, i) => i)));
    }
  }

  function bulkDeleteImages() {
    if (selectedImages.size > 0) {
      setShowBulkDeleteConfirm(true);
    }
  }

  function confirmBulkDelete() {
    const indicesToDelete = Array.from(selectedImages).sort((a, b) => b - a);
    let newImages = [...images];
    
    indicesToDelete.forEach(index => {
      newImages = newImages.filter((_, i) => i !== index);
    });
    
    // Reorder after deletion
    const reordered = newImages.map((img, i) => ({ ...img, order: i }));
    setImages(reordered);
    setSelectedImages(new Set());
    setShowBulkDeleteConfirm(false);
  }

  async function handleSave() {
    try {
      const res = await fetch('/api/gallery-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(images)
      });
      
      if (res.ok) {
        setStatusModal({ 
          isOpen: true, 
          status: 'success', 
          message: 'Gallery updated successfully!' 
        })
      } else {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update gallery')
      }
    } catch (error: any) {
      setStatusModal({ 
        isOpen: true, 
        status: 'error', 
        message: error.message || 'Failed to update gallery. Please try again.' 
      })
    }
  }

  function handleEditImage(index: number) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          const uploadRes = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              image: base64,
              folder: 'gallery'
            })
          });
          const uploadData = await uploadRes.json();
          
          if (uploadData.url) {
            const updatedImages = [...images];
            updatedImages[index].imageUrl = uploadData.url;
            setImages(updatedImages);
            setStatusModal({ 
              isOpen: true, 
              status: 'success', 
              message: 'Image replaced successfully!' 
            })
          } else {
            throw new Error(uploadData.error || 'Upload failed')
          }
        };
      } catch (error: any) {
        setStatusModal({ 
          isOpen: true, 
          status: 'error', 
          message: error.message || 'Failed to upload image. Please try again.' 
        })
      }
    };
    input.click();
  }

  function handleDragStart(index: number) {
    setDraggedIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newImages = [...images];
    const draggedImage = newImages[draggedIndex];
    newImages.splice(draggedIndex, 1);
    newImages.splice(index, 0, draggedImage);
    
    // Update order
    newImages.forEach((img, idx) => {
      img.order = idx;
    });
    
    setImages(newImages);
    setDraggedIndex(index);
  }

  function handleDragEnd() {
    setDraggedIndex(null);
  }

  return (
    <EditLayout>
      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Edit Gallery Page</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Upload and manage gallery images</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading gallery...</p>
          </div>
        ) : (
        <>
        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-6 md:p-8 mb-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
          <div className="relative">
          
          {/* Bulk Actions Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={selectAllImages}
                className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className={`w-4 h-4 sm:w-5 sm:h-5 border-2 border-sky-400 dark:border-sky-600 rounded bg-white dark:bg-gray-700 transition-all duration-200 flex items-center justify-center shadow-sm ${
                  selectedImages.size === images.length && images.length > 0 
                  ? 'bg-gradient-to-br from-sky-500 to-blue-600 border-sky-500 shadow-lg shadow-sky-500/50' 
                  : ''
                }`}>
                  <svg className={`w-3 h-3 text-white transition-opacity duration-200 ${
                    selectedImages.size === images.length && images.length > 0 
                    ? 'opacity-100' 
                    : 'opacity-0'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="hidden sm:inline">Select All</span>
                <span className="sm:hidden">All</span>
              </button>
              
              {selectedImages.size > 0 && (
                <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {selectedImages.size} selected
                </span>
              )}
            </div>
            
            {selectedImages.size > 0 && (
              <button
                onClick={bulkDeleteImages}
                className="flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="hidden sm:inline">Delete Selected ({selectedImages.size})</span>
                <span className="sm:hidden">Delete ({selectedImages.size})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
            {images.map((img, index) => (
              <div 
                key={index} 
                className={`relative group border-2 ${
                  selectedImages.has(index) 
                    ? 'border-sky-500 ring-2 ring-sky-500' 
                    : draggedIndex === index 
                    ? 'border-sky-500 scale-105' 
                    : 'border-gray-300 dark:border-gray-600'
                } rounded-lg overflow-hidden cursor-move transition-all`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                {/* Selection Checkbox */}
                <div className="absolute top-2 left-2 z-10">
                  <label className="relative cursor-pointer group/checkbox">
                    <input
                      type="checkbox"
                      checked={selectedImages.has(index)}
                      onChange={() => toggleImageSelection(index)}
                      onClick={(e) => e.stopPropagation()}
                      className="peer sr-only"
                    />
                    <div className="w-6 h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                      <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                  </label>
                </div>

                <Image
                  src={img.imageUrl}
                  alt={`Gallery ${index + 1}`}
                  width={300}
                  height={300}
                  className="w-full h-48 object-cover"
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  <button
                    onClick={() => handleEditImage(index)}
                    className="bg-blue-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-700"
                    title="Replace image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => deleteImage(index)}
                    className="bg-red-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                    title="Delete image"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm flex items-center gap-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                  </svg>
                  #{index + 1}
                </div>
              </div>
            ))}

            {/* Add Image Button */}
            <button
              onClick={handleImageUpload}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg h-48 flex flex-col items-center justify-center hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-gray-600 dark:text-gray-400">Add Images</span>
              <span className="text-xs text-gray-500 dark:text-gray-500 mt-1">(multiple)</span>
            </button>
          </div>
          </div>
        </div>

        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
          <div className="relative">
          <button
            onClick={handleSave}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Save Changes
          </button>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Gallery Management Tips</h3>
              <ul className="text-sm text-blue-800 dark:text-blue-200 mt-1 space-y-1">
                <li>• Click &quot;Add Images&quot; to upload multiple new images at once</li>
                <li>• Use checkboxes to select multiple images for bulk deletion</li>
                <li>• Click &quot;Select All&quot; to select/deselect all images</li>
                <li>• Drag and drop images to reorder them</li>
                <li>• Hover over an image and click the blue edit icon to replace it</li>
                <li>• Hover over an image and click the red trash icon to delete a single image</li>
                <li>• Images are automatically numbered based on their order</li>
                <li>• Click &quot;Save Changes&quot; to update the gallery on the website</li>
              </ul>
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      <StatusModal
        isOpen={statusModal.isOpen}
        status={statusModal.status}
        message={statusModal.message}
        onClose={() => setStatusModal({ ...statusModal, isOpen: false })}
      />
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Image"
        message="Are you sure you want to delete this image? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title="Delete Selected Images"
        message={`Are you sure you want to delete ${selectedImages.size} image(s)? This action cannot be undone.`}
        confirmText="Delete All"
        cancelText="Cancel"
        variant="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </EditLayout>
  );
}

