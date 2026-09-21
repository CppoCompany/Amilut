import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { finalize } from 'rxjs';

import { CustomersApi } from '../../../api/customers-api';
import type { CreateCustomerDto, CustomerDto } from '../../../api/models';

const SAVE_FAILED_MESSAGE = 'שמירת הלקוח נכשלה, נסה שוב';

/**
 * Modal popup for creating a new customer. Emits `saved` with the created
 * customer, or `cancelled` when closed via the button, Escape or the backdrop.
 */
@Component({
  selector: 'app-add-customer-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './add-customer-dialog.html',
  styleUrl: './add-customer-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onCancel()',
  },
})
export class AddCustomerDialog implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly api = inject(CustomersApi);
  private readonly destroyRef = inject(DestroyRef);

  /** Name typed in the search box, used to prefill the form. */
  readonly initialName = input('');

  /** Emitted with the newly created customer once the server confirms it. */
  readonly saved = output<CustomerDto>();

  /** Emitted when the user closes the popup without saving. */
  readonly cancelled = output<void>();

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly form = this.fb.group({
    name: this.fb.control('', [Validators.required, Validators.maxLength(255)]),
    address: this.fb.control('', [Validators.maxLength(500)]),
    phone: this.fb.control('', [Validators.maxLength(50)]),
    email: this.fb.control('', [Validators.email, Validators.maxLength(255)]),
    companyRegNumber: this.fb.control('', [
      Validators.pattern(/^\d*$/),
      Validators.maxLength(20),
    ]),
    contactName: this.fb.control('', [Validators.maxLength(255)]),
    contactPhone: this.fb.control('', [Validators.maxLength(50)]),
  });

  /** Set once a submit has been attempted, so errors show even on untouched fields. */
  protected readonly submitted = signal(false);

  /** True while the customer is being created on the server. */
  protected readonly saving = signal(false);

  /** Hebrew server error to show under the form, or `null`. */
  protected readonly error = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.nameInput().nativeElement.focus());
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(null));
  }

  ngOnInit(): void {
    this.form.controls.name.setValue(this.initialName().trim());
  }

  protected get name(): AbstractControl {
    return this.form.controls.name;
  }

  protected get address(): AbstractControl {
    return this.form.controls.address;
  }

  protected get phone(): AbstractControl {
    return this.form.controls.phone;
  }

  protected get email(): AbstractControl {
    return this.form.controls.email;
  }

  protected get companyRegNumber(): AbstractControl {
    return this.form.controls.companyRegNumber;
  }

  protected get contactName(): AbstractControl {
    return this.form.controls.contactName;
  }

  protected get contactPhone(): AbstractControl {
    return this.form.controls.contactPhone;
  }

  /** Whether to surface validation errors for a control yet. */
  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.submitted());
  }

  protected onSubmit(): void {
    if (this.saving()) return;
    this.error.set(null);
    // Trim before validating so a whitespace-only name is rejected as required.
    this.form.controls.name.setValue(this.form.controls.name.value.trim());

    if (this.form.invalid) {
      this.submitted.set(true);
      this.form.markAllAsTouched();
      return;
    }

    const { name, address, phone, email, companyRegNumber, contactName, contactPhone } =
      this.form.getRawValue();
    const dto: CreateCustomerDto = {
      name,
      address: address.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      companyRegNumber: companyRegNumber.trim() || null,
      contactName: contactName.trim() || null,
      contactPhone: contactPhone.trim() || null,
    };

    this.saving.set(true);
    this.api
      .create(dto)
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (customer) => this.saved.emit(customer),
        error: () => this.error.set(SAVE_FAILED_MESSAGE),
      });
  }

  protected onCancel(): void {
    if (this.saving()) return;
    this.cancelled.emit();
  }

  /** Only clicks on the backdrop itself (not inside the card) cancel. */
  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onCancel();
    }
  }
}
