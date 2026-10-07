/** Cuota de almacenamiento por cuenta: 1 GB (el diseño habla de "180 MB de 1 GB"). */
export const STORAGE_QUOTA_BYTES = 1024 * 1024 * 1024;

export interface StorageUsage {
	usedBytes: number;
	quotaBytes: number;
	notesBytes: number;
	imagesBytes: number;
	trashBytes: number;
}
