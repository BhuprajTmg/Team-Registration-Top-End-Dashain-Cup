from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("registration", "0004_payment_receipt"),
    ]

    operations = [
        migrations.AddField(
            model_name="teamregistration",
            name="category",
            field=models.CharField(
                choices=[("mens", "Men's"), ("veteran", "Veteran")],
                db_index=True,
                default="mens",
                help_text="Men's or Veteran — used to group and filter teams.",
                max_length=20,
                verbose_name="Team category",
            ),
        ),
    ]
