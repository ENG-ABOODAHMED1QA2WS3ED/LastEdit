const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { machineIdSync } = require('node-machine-id');

const SECRET_KEY = 'AbuKamilPOS-2026-SecretKey-X9K2M';

const PLAN_NAMES = {
    trial: 'تجربة مجانية (يومين)',
    monthly: 'شهري',
    quarter: '3 شهور',
    half: '6 شهور'
};

class LicenseManager {
    constructor(appDataPath) {
        this.licenseFile = path.join(appDataPath, 'license.json');
        this.machineId = machineIdSync({ original: true });
    }

    validateLicenseKey(licenseKey) {
        try {
            const parts = licenseKey.trim().split('.');
            if (parts.length !== 2) return { valid: false, error: 'مفتاح غير صالح' };

            const payloadStr = Buffer.from(parts[0], 'base64url').toString('utf8');
            const payload = JSON.parse(payloadStr);

            const expectedSig = crypto
                .createHmac('sha256', SECRET_KEY)
                .update(payloadStr)
                .digest('base64url');

            if (expectedSig !== parts[1]) {
                return { valid: false, error: 'مفتاح مزوّر أو غير صالح' };
            }

            if (payload.mid !== this.machineId) {
                return { valid: false, error: 'هذا المفتاح مخصص لجهاز آخر' };
            }

            const expiry = new Date(payload.exp + 'T23:59:59');
            const now = new Date();
            if (now > expiry) {
                return { valid: false, error: 'انتهت صلاحية المفتاح', expired: true, expiry: payload.exp, plan: payload.plan };
            }

            const todayStr = now.toISOString().split('T')[0]; const expiryStr = payload.exp; const todayDate = new Date(todayStr); const expiryDate2 = new Date(expiryStr); const daysLeft = Math.max(0, Math.round((expiryDate2 - todayDate) / (1000 * 60 * 60 * 24)));

            return {
                valid: true,
                plan: payload.plan,
                planName: PLAN_NAMES[payload.plan] || payload.plan,
                expiry: payload.exp,
                created: payload.iat,
                daysLeft: daysLeft,
                machineId: payload.mid
            };
        } catch (e) {
            return { valid: false, error: 'مفتاح غير صالح: ' + e.message };
        }
    }

    activateLicense(licenseKey) {
        const result = this.validateLicenseKey(licenseKey);
        if (!result.valid) return result;

        const data = {
            key: licenseKey,
            activatedAt: new Date().toISOString(),
            machineId: this.machineId
        };

        fs.writeFileSync(this.licenseFile, JSON.stringify(data, null, 2), 'utf8');
        return { valid: true, activated: true, ...result };
    }

    checkLicense() {
        try {
            if (!fs.existsSync(this.licenseFile)) {
                return { valid: false, error: 'no_license', message: 'لا يوجد ترخيص مفعّل' };
            }

            const data = JSON.parse(fs.readFileSync(this.licenseFile, 'utf8'));

            if (data.machineId !== this.machineId) {
                return { valid: false, error: 'wrong_machine', message: 'الترخيص مخصص لجهاز آخر' };
            }

            return this.validateLicenseKey(data.key);
        } catch (e) {
            return { valid: false, error: 'corrupt', message: 'ملف الترخيص تالف' };
        }
    }

    removeLicense() {
        if (fs.existsSync(this.licenseFile)) {
            fs.unlinkSync(this.licenseFile);
        }
    }

    getMachineId() {
        return this.machineId;
    }
}

module.exports = LicenseManager;
