const fetch = require('node-fetch')

const PAYPAL_CLIENT = process.env.PAYPAL_CLIENT_ID
const PAYPAL_SECRET = process.env.PAYPAL_CLIENT_SECRET
const PAYPAL_API = process.env.PAYPAL_API || 'https://api-m.sandbox.paypal.com'

async function getAccessToken() {
    if (!PAYPAL_CLIENT || !PAYPAL_SECRET) {
        throw new Error('Missing PayPal client credentials')
    }

    const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${PAYPAL_CLIENT}:${PAYPAL_SECRET}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`PayPal auth failed: ${text}`)
    }

    const data = await response.json()
    return data.access_token
}

async function createOrder(amount, currency = 'SGD', context = {}) {
    const accessToken = await getAccessToken()
    const applicationContext = {}

    if (context.returnUrl) {
        applicationContext.return_url = context.returnUrl
    }
    if (context.cancelUrl) {
        applicationContext.cancel_url = context.cancelUrl
    }

    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
                amount: {
                    currency_code: currency,
                    value: amount
                }
            }],
            ...(Object.keys(applicationContext).length ? { application_context: applicationContext } : {})
        })
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`PayPal order create failed: ${text}`)
    }

    return response.json()
}

async function captureOrder(orderId) {
    const accessToken = await getAccessToken()
    const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
        }
    })

    if (!response.ok) {
        const text = await response.text()
        throw new Error(`PayPal capture failed: ${text}`)
    }

    return response.json()
}

module.exports = { createOrder, captureOrder }
