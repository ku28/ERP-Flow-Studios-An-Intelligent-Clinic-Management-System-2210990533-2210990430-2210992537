import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import EditLayout from '../components/EditLayout';
import StatusModal from '../components/StatusModal';

interface ContactInfo {
  address: string;
  phone: string;
  email: string;
  hours: string;
}

export default function EditContactPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [content, setContent] = useState<ContactInfo>({
    address: '',
    phone: '',
    email: '',
    hours: ''
  });
  const [loading, setLoading] = useState(true);
  
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
    loadContent();
  }, [user]);

  async function loadContent() {
    try {
      const res = await fetch('/api/contact-info');
      const data = await res.json();
      setContent(data);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      setStatusModal({ 
        isOpen: true, 
        status: 'error', 
        message: 'Failed to load contact information. Please try again.' 
      })
    }
  }

  async function handleSave() {
    try {
      const res = await fetch('/api/contact-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content)
      });
      
      if (res.ok) {
        setStatusModal({ 
          isOpen: true, 
          status: 'success', 
          message: 'Contact information updated successfully!' 
        })
      } else {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update contact information')
      }
    } catch (error: any) {
      setStatusModal({ 
        isOpen: true, 
        status: 'error', 
        message: error.message || 'Failed to update contact information. Please try again.' 
      })
    }
  }

  return (
    <EditLayout>
      <div className="max-w-5xl mx-auto px-4 pb-20">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Edit Contact Page</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Update your contact information</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Loading contact information...</p>
          </div>
        ) : (
        <>
        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-6 md:p-8 space-y-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
          <div className="relative">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Address</label>
            <textarea
              value={content.address}
              onChange={(e) => setContent({ ...content, address: e.target.value })}
              rows={3}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="Enter physical address (use line breaks for formatting)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Phone Number</label>
            <input
              type="tel"
              value={content.phone}
              onChange={(e) => setContent({ ...content, phone: e.target.value })}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="+1 (555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Email Address</label>
            <input
              type="email"
              value={content.email}
              onChange={(e) => setContent({ ...content, email: e.target.value })}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="info@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Business Hours</label>
            <textarea
              value={content.hours}
              onChange={(e) => setContent({ ...content, hours: e.target.value })}
              rows={4}
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="Monday - Friday: 9:00 AM - 6:00 PM&#10;Saturday: 10:00 AM - 4:00 PM&#10;Sunday: Closed"
            />
          </div>

          <button
            onClick={handleSave}
            className="w-full bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transition-all"
          >
            Save Changes
          </button>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
          <h3 className="font-semibold mb-2 text-blue-900 dark:text-blue-100">Instructions:</h3>
          <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
            <li>Update your contact information in the fields above</li>
            <li>Use line breaks in Address and Hours fields for better formatting</li>
            <li>Make sure email and phone are correctly formatted</li>
            <li>Click &quot;Save Changes&quot; to update the information</li>
            <li>Use the navigation above to edit other pages</li>
          </ul>
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
    </EditLayout>
  );
}

