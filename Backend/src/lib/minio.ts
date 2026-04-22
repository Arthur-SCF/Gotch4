import * as Minio from 'minio'

// MinIO configuration
const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'localhost'
const MINIO_PORT = parseInt(process.env.MINIO_PORT || '9000')
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY
export const MINIO_BUCKET = process.env.MINIO_BUCKET || 'exploits'
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === 'true'

// Validate required MinIO credentials
if (!MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
  throw new Error(
    'MINIO_ACCESS_KEY and MINIO_SECRET_KEY must be set in environment variables. ' +
    'Refusing to fall back to default credentials.'
  )
}

// Initialize MinIO client
export const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
})

// Ensure bucket exists, create if it doesn't
export async function ensureBucketExists(): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(MINIO_BUCKET)
    if (!exists) {
      await minioClient.makeBucket(MINIO_BUCKET, 'us-east-1')
      console.log(`MinIO bucket '${MINIO_BUCKET}' created successfully`)
    } else {
      console.log(`MinIO bucket '${MINIO_BUCKET}' already exists`)
    }
  } catch (error) {
    console.error('Error ensuring MinIO bucket exists:', error)
    throw error
  }
}
