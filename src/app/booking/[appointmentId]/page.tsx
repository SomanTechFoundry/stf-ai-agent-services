import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { utcToLocal } from "@/lib/utils/date-time";

interface Props {
  params: Promise<{ appointmentId: string }>;
}

function formatDisplayDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatDisplayTime(time: string): string {
  const [hStr, min] = time.split(":");
  const h = Number(hStr);
  const period = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${min} ${period}`;
}

async function loadAppointment(appointmentId: string) {
  return prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      business: {
        select: {
          name: true,
          slug: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          timezone: true,
          cancellationPolicyHours: true,
          status: true,
        },
      },
      service: { select: { name: true, durationMinutes: true } },
      staff: { select: { name: true } },
      customer: { select: { name: true } },
    },
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { appointmentId } = await params;
  const appt = await loadAppointment(appointmentId);
  if (!appt) return { title: "Booking not found" };
  return {
    title: `Booking at ${appt.business.name}`,
    description: `${appt.service.name} on ${utcToLocal(appt.startTime, appt.business.timezone).date}`,
  };
}

export default async function BookingConfirmationPage({ params }: Props) {
  const { appointmentId } = await params;
  const appt = await loadAppointment(appointmentId);
  if (!appt || appt.business.status === "SUSPENDED" || appt.business.status === "CANCELLED") {
    notFound();
  }

  const local = utcToLocal(appt.startTime, appt.business.timezone);
  const address = [appt.business.address, appt.business.city, appt.business.state]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="min-h-screen bg-[#f4f2ee] px-4 py-12">
      <div className="mx-auto max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-teal-800">
          {appt.business.name}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {appt.status === "CANCELLED" ? "Booking cancelled" : "You're booked"}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {appt.customer.name ? `For ${appt.customer.name}` : "Appointment details"}
        </p>

        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Service</dt>
            <dd className="font-medium text-slate-900">{appt.service.name}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">When</dt>
            <dd className="text-right font-medium text-slate-900">
              {formatDisplayDate(local.date)}
              <br />
              {formatDisplayTime(local.time)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Duration</dt>
            <dd className="font-medium text-slate-900">{appt.service.durationMinutes} min</dd>
          </div>
          {appt.staff && (
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">With</dt>
              <dd className="font-medium text-slate-900">{appt.staff.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Status</dt>
            <dd className="font-medium text-slate-900">{appt.status.replace("_", " ")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Price</dt>
            <dd className="font-medium text-slate-900">
              ${Number(appt.price).toFixed(2)} {appt.currency}
            </dd>
          </div>
          {address && (
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">Where</dt>
              <dd className="text-right font-medium text-slate-900">{address}</dd>
            </div>
          )}
        </dl>

        <p className="mt-6 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
          Please give at least {appt.business.cancellationPolicyHours} hours notice to cancel
          or reschedule.
        </p>

        {appt.business.phone && (
          <p className="mt-4 text-sm text-stone-500">
            Questions?{" "}
            <a className="font-medium text-teal-800" href={`tel:${appt.business.phone}`}>
              {appt.business.phone}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
