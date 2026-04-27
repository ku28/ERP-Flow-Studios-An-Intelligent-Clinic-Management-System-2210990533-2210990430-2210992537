import admin from 'firebase-admin'

let initialized = false

function getFirebaseAdminConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    return null
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n')
  }
}

export function getFirebaseMessaging() {
  if (!initialized && !admin.apps.length) {
    const config = getFirebaseAdminConfig()
    if (!config) {
      return null
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      }),
    })

    initialized = true
  }

  if (!admin.apps.length) {
    return null
  }

  return admin.messaging()
}
