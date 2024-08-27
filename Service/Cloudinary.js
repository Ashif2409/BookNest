const cloudinary=require('cloudinary').v2;

const UploadAndReturnUrl = async (file, publicId) => {
    cloudinary.config({
        cloud_name: process.env.CLOUD_NAME,
        api_key: process.env.API_KEY,
        api_secret: process.env.API_SECRET_KEY,
    });

    try {
        const uploadResult = await cloudinary.uploader.upload(file, {
            public_id: publicId,
        });
        return uploadResult.secure_url;
    } catch (error) {
        console.error('Upload failed:', error);
        throw error;
    }
};

module.exports = UploadAndReturnUrl