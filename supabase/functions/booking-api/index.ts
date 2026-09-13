import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

const messageForWirni = (booking: Record<string, unknown>) => {
  const lines = [
    'Hi Wirni! I have made a Mama Ashtanga booking.',
    `Reference: ${booking.booking_reference}`,
    `Name: ${booking.contact_name}`,
    `Class: ${booking.class_type_name}`,
    `Date: ${booking.starts_at}`,
    `People: ${booking.party_size}`,
    booking.preferred_time ? `Preferred time: ${booking.preferred_time}` : '',
  ].filter(Boolean)

  return `https://wa.me/60126243655?text=${encodeURIComponent(lines.join('\n'))}`
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Server is not configured' }, 500)

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const url = new URL(request.url)

  try {
    if (request.method === 'GET' && url.pathname.endsWith('/sessions')) {
      const from = url.searchParams.get('from') || new Date().toISOString()
      const to = url.searchParams.get('to') || new Date(Date.now() + 90 * 86400000).toISOString()
      const { data, error } = await db.rpc('get_session_availability', { p_from: from, p_to: to })
      if (error) throw error
      return json({ sessions: data })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/bookings')) {
      const body = await request.json()
      const { data, error } = await db.rpc('create_guest_booking', {
        p_session_id: body.sessionId,
        p_contact_name: body.name,
        p_contact_email: body.email,
        p_contact_phone: body.phone,
        p_party_size: body.partySize,
        p_member_note: body.note || null,
        p_payment_method: body.paymentMethod || 'cash',
        p_preferred_time: body.preferredTime || null,
        p_client_request_id: body.requestId || null,
      })
      if (error) throw error

      const created = data?.[0]
      if (!created) return json({ error: 'Booking was not created' }, 500)

      const { data: detail, error: detailError } = await db.rpc('get_guest_booking', {
        p_cancellation_token: created.cancellation_token,
      })
      if (detailError) throw detailError

      const booking = { ...created, ...(detail?.[0] || {}) }
      return json({
        booking,
        managementToken: created.cancellation_token,
        whatsappUrl: messageForWirni(booking),
      }, 201)
    }

    if (request.method === 'GET' && url.pathname.endsWith('/booking')) {
      const token = url.searchParams.get('token')
      if (!token) return json({ error: 'Management token is required' }, 400)
      const { data, error } = await db.rpc('get_guest_booking', { p_cancellation_token: token })
      if (error) throw error
      if (!data?.length) return json({ error: 'Booking not found' }, 404)
      return json({ booking: data[0] })
    }

    if (request.method === 'POST' && url.pathname.endsWith('/cancel')) {
      const body = await request.json()
      const { data, error } = await db.rpc('cancel_guest_booking', {
        p_cancellation_token: body.token,
        p_reason: body.reason || null,
      })
      if (error) throw error
      return json({ cancellation: data?.[0] })
    }

    return json({ error: 'Route not found' }, 404)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('24 hours') || message.includes('places remain') ? 409 : 400
    return json({ error: message }, status)
  }
})

