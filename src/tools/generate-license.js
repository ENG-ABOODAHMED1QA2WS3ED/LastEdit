const crypto = require('crypto');

const SECRET_KEY = 'AbuKamilPOS-2026-SecretKey-X9K2M';

const PLANS = {
    trial:    { days: 2,   name: 'تجربة مجانية',      price: 0 },
    monthly:  { days: 30,  name: 'شهري',              price: 400 },
    quarter:  { days: 90,  name: '3 شهور',            price: 1000 },
    half:     { days: 180, name: '6 شهور',            price: 4000 }
};

function generateLicense(machineId, plan) {
    if (!PLANS[plan]) {
        console.error('Plans: trial, monthly, quarter, half');
        process.exit(1);
    }

    const p = PLANS[plan];
    const now = new Date();
    const expiry = new Date(now.getTime() + p.days * 24 * 60 * 60 * 1000);

    const payload = {
        mid: machineId,
        plan: plan,
        exp: expiry.toISOString().split('T')[0],
        iat: now.toISOString().split('T')[0]
    };

    const payloadStr = JSON.stringify(payload);
    const payloadB64 = Buffer.from(payloadStr).toString('base64url');

    const signature = crypto
        .createHmac('sha256', SECRET_KEY)
        .update(payloadStr)
        .digest('base64url');

    const license = payloadB64 + '.' + signature;

    console.log('\n===========================================');
    console.log('  Abu Kamil POS - License Generator');
    console.log('===========================================');
    console.log('Machine ID :', machineId);
    console.log('Plan       :', p.name, '(' + p.price + ' NIS)');
    console.log('Created    :', payload.iat);
    console.log('Expires    :', payload.exp);
    console.log('-------------------------------------------');
    console.log('LICENSE KEY:');
    console.log(license);
    console.log('===========================================\n');

    return license;
}

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: node generate-license.js <machineId> <plan>');
    console.log('Plans: trial, monthly, quarter, half');
    process.exit(1);
}

generateLicense(args[0], args[1]);
