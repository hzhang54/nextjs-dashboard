'use server';

import { z } from 'zod';
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}

const sql = postgres(process.env.DATABASE_URL!, {ssl: 'require'});

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error: 'Please select a customer',
    }),
    amount: z.coerce
        .number()
        .gt(0, { message: 'Amount must be greater than $0' }),
    status: z.enum(['paid', 'pending'], {
        invalid_type_error: 'Please select an invoice status',
    }),
    date: z.string(),
});

export async function deleteInvoice(id: string) {
    await sql`
        DELETE FROM invoices
        WHERE id = ${id}
    `;

    revalidatePath('/dashboard/invoices');
}

// Use Zod to update the expected types
const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function updateInvoice(
    id: string, 
    prevState: State, 
    formData: FormData) {
    const validatedFields = UpdateInvoice.safeParse({
        customerId: formData.get('customerId'),
        amount: formData.get('amount'),
        status: formData.get('status'),
    });

    if (!validatedFields.success) {
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'Please fix the errors in the form. Failed to update invoice.',
        };
    }
    //const { customerId, amount, status } = UpdateInvoice.parse({
    //    customerId: formData.get('customerId'),
    //    amount: formData.get('amount'),
    //    status: formData.get('status'),
    //});
    const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100;

    try {
        await sql`
            UPDATE invoices
            SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
            WHERE id = ${id}
        `;
    } catch (error) {
        console.error('Datebase Error: Error updating invoice:', error);
    }
    revalidatePath('/dashboard/invoices');
    redirect('/dashboard/invoices');
}

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const rawFormData = {
    customerId: formData.get('customerId'),
    amout: formData.get('amount'),
    status: formData.get('status'),
  };
  // Validate the form data using Zod
  const validatedFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
  // If form validation fails, return errors early. Otherwise, continue.
  if (!validatedFields.success) {
    return {
        errors: validatedFields.error.flatten().fieldErrors,
        message: 'Please fix the errors in the form. Failed to create invoice.',
    };
  }
  // Test it out
  //console.log('Creating invoice with data:', rawFormData);   
  //console.log('Type of amount:', typeof rawFormData.amout);
  //const { customerId, amount, status } = CreateInvoice.parse({
  //  customerId: formData.get('customerId'),
  //  amount: formData.get('amount'),
  //  status: formData.get('status'),
  //});
  // prepare the data for insertion
  const { customerId, amount, status } = validatedFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];
  // Insert the invoice into the database
  try {
    await sql`
        INSERT INTO invoices (customer_id, amount, status, date)
        VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;
  } catch (error) {
    // If a database error occurs, return a more specific error.
    return {
        message: 'Database error: Failed to create invoice.',
    }
    //console.error('Error inserting invoice:', error);
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}